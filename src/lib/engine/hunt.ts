import { createHash } from "node:crypto";
import { z } from "zod";
import { append, getRun, type RunDepth } from "@/lib/run-store";
import {
	type CandidateSignal,
	CandidateSignalSchema,
	type Enrichment,
	EnrichmentSchema,
	type ICPHypothesis,
	type Lead,
	LeadSchema,
	type OutreachDraft,
	OutreachDraftSchema,
	type QueryPlan,
	type RunEvent,
	RunEventSchema,
	ScoreBreakdownSchema,
} from "@/lib/schemas";
import { enrichLead } from "./enrich";
import { quoteMatchScore } from "./evidence";
import { oneShot } from "./judge";
import { postToRoom } from "./tools/band";
import {
	addVerifiedLeadMemory,
	leadEntitySummary,
	recallDuplicate,
} from "./tools/hydradb";
import { upsertRun, upsertVerifiedLead } from "./tools/insforge";
import { extractNimble, searchNimble } from "./tools/nimble";
import { extractTavily, getTavilyBudget, searchTavily } from "./tools/tavily";
import { fetchYouComContents, searchYouCom } from "./tools/youcom";

type EngineEventInput = RunEvent extends infer Event
	? Event extends RunEvent
		? Omit<Event, "runId" | "seq" | "ts">
		: never
	: never;

export interface HuntContext {
	runId: string;
	domain: string;
	depth: RunDepth;
	quota: number;
	radar: boolean;
	lastBudgetSpent: number;
	acceptedLead?: Lead;
}

export interface WebResult {
	title: string;
	url: string;
	content: string;
	publishedDate?: string;
	synthetic?: boolean;
	provider: "tavily" | "youcom" | "nimble";
}

interface ExtractResult {
	url: string;
	rawContent: string;
	provider: string;
	synthetic?: boolean;
}

interface CandidateOutcome {
	advanced: boolean;
	verified: boolean;
}

type FinalizationResult =
	| { accepted: true; leadId: string; quoteMatchScore: number }
	| { accepted: false; reason: string };

const SCORE_THRESHOLD = 65;
const EVIDENCE_THRESHOLD = 0.8;
const mirrorTypes = new Set<RunEvent["type"]>([
	"stage_change",
	"strategy_pivot",
	"lead_verified",
	"signal_rejected",
	"radar_alert",
]);
const leadSaveQueues = new Map<string, Promise<void>>();

const JudgeScoreSchema = ScoreBreakdownSchema.omit({ total: true });
const GauntletJudgmentSchema = z
	.object({
		verdict: z.enum(["advance", "reject"]),
		rejectReason: z.string().min(1).optional(),
		extracted: z
			.object({
				quote: z.string().min(1),
				authorHandle: z.string().min(1).optional(),
				authorDisplay: z.string().min(1).optional(),
				company: z.string().min(1).optional(),
				publishedAt: z.union([
					z.string().datetime({ offset: true }),
					z.literal("date_unavailable"),
				]),
				sourceType: z.string().min(1),
			})
			.strict()
			.optional(),
		person: z
			.object({
				name: z.string().min(1),
				type: z.enum(["person", "company"]),
			})
			.strict()
			.optional(),
		score: JudgeScoreSchema.optional(),
		whyFit: z.string().min(1).optional(),
		whyNow: z.string().min(1).optional(),
	})
	.strict();

type JudgeScore = z.infer<typeof JudgeScoreSchema>;

function mirrorText(event: RunEvent): string {
	switch (event.type) {
		case "stage_change":
			return `Run stage: ${event.payload.state}`;
		case "strategy_pivot":
			return `Strategy pivot: ${event.payload.rationale}`;
		case "lead_verified":
			return `Verified lead: ${event.payload.name}`;
		case "signal_rejected":
			return `Signal rejected: ${event.payload.reason}`;
		case "radar_alert":
			return `Radar alert: ${event.payload.name}`;
		default:
			return event.type;
	}
}

export function appendEngineEvent(
	runId: string,
	event: EngineEventInput,
): RunEvent {
	const run = getRun(runId);
	if (!run) {
		throw new Error(`Unknown run: ${runId}`);
	}

	const parsed = RunEventSchema.parse({
		...event,
		runId,
		seq: (run.events.at(-1)?.seq ?? 0) + 1,
		ts: new Date().toISOString(),
	});
	const stored = append(runId, parsed);
	if (mirrorTypes.has(stored.type)) {
		void postToRoom(runId, mirrorText(stored));
	}
	return stored;
}

export async function persistRunState(context: HuntContext): Promise<void> {
	const run = getRun(context.runId);
	if (!run) return;
	try {
		await upsertRun({
			id: run.id,
			domain: run.domain,
			depth: run.depth,
			state: run.state,
			createdAt: run.createdAt,
		});
	} catch (error) {
		console.warn(
			`[engine] InsForge run upsert failed for ${context.runId}`,
			error instanceof Error ? error.message : error,
		);
	}
}

export function signalHash(url: string, authorHandle?: string): string {
	const normalizedUrl = new URL(url);
	normalizedUrl.hash = "";
	normalizedUrl.hostname = normalizedUrl.hostname.toLocaleLowerCase("en-US");
	normalizedUrl.searchParams.sort();
	const normalized = normalizedUrl.toString().replace(/\/$/u, "");
	return createHash("sha256")
		.update(`${normalized}${authorHandle ?? ""}`)
		.digest("hex");
}

export function emitBudget(context: HuntContext): void {
	const budget = getTavilyBudget(context.runId);
	if (budget.spent === context.lastBudgetSpent) return;
	context.lastBudgetSpent = budget.spent;
	appendEngineEvent(context.runId, {
		lane: "system",
		type: "budget_update",
		payload: { ...budget, provider: "tavily" },
	});
}

export function storedConfirmedHunt(
	runId: string,
): { icp: ICPHypothesis; plan: QueryPlan } | undefined {
	const run = getRun(runId);
	if (!run?.selectedIcpId) return undefined;
	let plan: QueryPlan | undefined;
	let icp: ICPHypothesis | undefined;
	for (let index = run.events.length - 1; index >= 0; index -= 1) {
		const event = run.events[index];
		if (
			!plan &&
			event.type === "stage_change" &&
			event.payload.queryPlan?.icpId === run.selectedIcpId
		) {
			plan = event.payload.queryPlan;
		}
		if (event.type === "stage_change" && event.payload.icps) {
			icp = event.payload.icps.find(
				(hypothesis) => hypothesis.id === run.selectedIcpId,
			);
		}
		if (plan && icp) return { icp, plan };
	}
	return undefined;
}

// Channels are only labels unless the query is scoped to where individual
// voices actually live. General web search on a raw query returns press
// releases, job boards, and SEO marketing — none of which carry a quotable
// person expressing pain, so the gauntlet rejects all of them. Single-site
// `site:` scoping (verified reliable across Tavily/You.com/Nimble; multi-site
// OR is not) forces results onto the platform the channel names.
const CHANNEL_SITE_SCOPE: Partial<
	Record<CandidateSignal["channel"], string>
> = {
	reddit: "site:reddit.com",
	hn: "site:news.ycombinator.com",
	x: "site:x.com",
	reviews: "site:g2.com",
	github: "site:github.com",
};

function scopeQueryToChannel(
	queryText: string,
	channel: CandidateSignal["channel"],
): string {
	const scope = CHANNEL_SITE_SCOPE[channel];
	if (!scope || /\bsite:/iu.test(queryText)) return queryText;
	return `${queryText} ${scope}`;
}

function providerOrder(
	requested?: "tavily" | "youcom" | "nimble",
): Array<"tavily" | "youcom" | "nimble"> {
	const providers = ["tavily", "youcom", "nimble"] as const;
	return requested
		? [requested, ...providers.filter((provider) => provider !== requested)]
		: [...providers];
}

export async function searchWeb(
	context: HuntContext,
	queryText: string,
	requested?: "tavily" | "youcom" | "nimble",
	maxResults = 5,
): Promise<WebResult[]> {
	for (const provider of providerOrder(requested)) {
		try {
			const results =
				provider === "tavily"
					? await searchTavily(context.runId, queryText, { maxResults })
					: provider === "youcom"
						? await searchYouCom(queryText, { count: maxResults })
						: await searchNimble(queryText, { maxResults });
			if (provider === "tavily") emitBudget(context);
			const usableResults = results.filter(
				(result) => !("synthetic" in result && result.synthetic),
			);
			if (usableResults.length > 0) {
				return usableResults.map((result) => ({ ...result, provider }));
			}
		} catch (error) {
			if (provider === "tavily") emitBudget(context);
			console.warn(
				`[engine] ${provider} search failed; trying fallback`,
				error instanceof Error ? error.message : error,
			);
		}
	}
	return [];
}

function stripHtml(value: string): string {
	return value
		.replace(/<[^>]+>/gu, " ")
		.replace(/&#x27;|&#39;/gu, "'")
		.replace(/&quot;/gu, '"')
		.replace(/&amp;/gu, "&")
		.replace(/&gt;/gu, ">")
		.replace(/&lt;/gu, "<")
		.replace(/\s+/gu, " ")
		.trim();
}

// Hacker News and Reddit are where individual pain lives, but the general web
// extractors return only thin page headers (Tavily) or fail outright (Reddit).
// Both platforms expose full thread text through native endpoints — use them so
// the gauntlet judge actually sees the quotable comment, not just the title.
async function nativeExtract(url: string): Promise<ExtractResult | undefined> {
	try {
		const hn = /news\.ycombinator\.com\/item\?id=(\d+)/u.exec(url);
		if (hn) {
			const response = await fetch(
				`https://hn.algolia.com/api/v1/items/${hn[1]}`,
				{ signal: AbortSignal.timeout(12_000) },
			);
			if (!response.ok) return undefined;
			const item = (await response.json()) as {
				author?: string;
				title?: string;
				text?: string;
				children?: unknown[];
			};
			const parts: string[] = [];
			// Attribute every node to its HN username. The gauntlet requires a real
			// identifiable person; without the author the judge sees an anonymous
			// wall of text and rejects it as unattributed.
			const walk = (node: {
				author?: string;
				title?: string;
				text?: string;
				children?: unknown[];
			}): void => {
				const who = node.author ? `${node.author}: ` : "";
				if (node.title) parts.push(`${who}${stripHtml(node.title)}`);
				if (node.text) parts.push(`${who}${stripHtml(node.text)}`);
				for (const child of node.children ?? []) {
					walk(child as Parameters<typeof walk>[0]);
				}
			};
			walk(item);
			const rawContent = parts.join("\n").trim();
			if (rawContent.length > 0) {
				return { url, rawContent, provider: "hn-algolia" };
			}
		}
	} catch {
		// fall through to the provider chain
	}
	return undefined;
}

export async function extractWeb(
	context: HuntContext,
	urls: string[],
	requested?: "tavily" | "nimble",
): Promise<ExtractResult[]> {
	const requestedUrls = new Set(urls.map((url) => new URL(url).href));
	if (urls.length === 1) {
		const native = await nativeExtract(urls[0]);
		if (native) return [native];
	}
	// Reddit blocks Tavily/native JSON but You.com's full-page contents succeed,
	// so try You.com first for Reddit URLs instead of burning the chain on failures.
	const isReddit = urls.some((url) => /(^|\.)reddit\.com/iu.test(new URL(url).hostname));
	const availableProviders = isReddit
		? (["youcom", "tavily", "nimble"] as const)
		: (["tavily", "nimble", "youcom"] as const);
	const providers = requested
		? [
				requested,
				...availableProviders.filter((provider) => provider !== requested),
			]
		: [...availableProviders];
	for (const provider of providers) {
		try {
			const results =
				provider === "tavily"
					? await extractTavily(context.runId, urls)
					: provider === "nimble"
						? await extractNimble(urls)
						: (await fetchYouComContents(urls)).map((entry) => ({
								...entry,
								provider: "youcom",
							}));
			if (provider === "tavily") emitBudget(context);
			const usableResults = results.filter(
				(result) =>
					!("synthetic" in result && result.synthetic) &&
					result.rawContent.trim().length > 0 &&
					requestedUrls.has(new URL(result.url).href),
			);
			if (usableResults.length > 0) {
				return usableResults.map((result) => ({ ...result, provider }));
			}
		} catch (error) {
			if (provider === "tavily") emitBudget(context);
			console.warn(
				`[engine] ${provider} extract failed; trying fallback`,
				error instanceof Error ? error.message : error,
			);
		}
	}
	return [];
}

export function passesEvidenceGate(quote: string, pageText: string): boolean {
	return quoteMatchScore(quote, pageText) >= EVIDENCE_THRESHOLD;
}

function rejectLead(
	context: HuntContext,
	candidate: CandidateSignal,
	reason: string,
): FinalizationResult {
	appendEngineEvent(context.runId, {
		lane: "verifier",
		type: "signal_rejected",
		payload: { signal: candidate, reason },
	});
	return { accepted: false, reason };
}

function normalizedEntitySummary(value: string): string {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase("en-US")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

function isSimilarLeadEntity(left: Lead, right: Lead): boolean {
	const normalizedLeft = normalizedEntitySummary(leadEntitySummary(left));
	const normalizedRight = normalizedEntitySummary(leadEntitySummary(right));
	return (
		normalizedLeft === normalizedRight ||
		(Math.min(normalizedLeft.length, normalizedRight.length) >= 4 &&
			(normalizedLeft.includes(normalizedRight) ||
				normalizedRight.includes(normalizedLeft)))
	);
}

export async function finalizeVerifiedLead(
	context: HuntContext,
	candidateInput: CandidateSignal,
	leadInput: Lead,
	draftInput: OutreachDraft,
	verifiedContent?: string,
): Promise<FinalizationResult> {
	const candidate = CandidateSignalSchema.parse(candidateInput);
	let lead = LeadSchema.parse(leadInput);
	const draft = OutreachDraftSchema.parse(draftInput);
	if (lead.runId !== context.runId) {
		return rejectLead(context, candidate, "lead runId does not match this run");
	}
	if (new URL(lead.signal.url).href !== new URL(candidate.url).href) {
		return rejectLead(context, candidate, "lead URL does not match candidate");
	}
	if (draft.leadId !== lead.id) {
		return rejectLead(context, candidate, "draft leadId does not match lead");
	}
	if (
		draft.groundedIn.some(
			(url) => new URL(url).href !== new URL(lead.signal.url).href,
		)
	) {
		return rejectLead(
			context,
			candidate,
			"draft cites a URL other than the verified signal",
		);
	}

	lead = LeadSchema.parse({
		...lead,
		signal: {
			...lead.signal,
			hash: signalHash(lead.signal.url, lead.signal.authorHandle),
		},
		score: {
			...lead.score,
			total: scoreTotal(lead.score),
		},
	});
	if (lead.score.total < SCORE_THRESHOLD) {
		return rejectLead(
			context,
			candidate,
			`score ${lead.score.total} is below the qualifying threshold of 65`,
		);
	}

	let run = getRun(context.runId);
	if (!run) throw new Error(`Unknown run: ${context.runId}`);
	if (
		(!context.radar && (run.state !== "HUNTING" || !run.selectedIcpId)) ||
		(context.radar && run.state !== "REVIEW" && run.state !== "RADAR")
	) {
		return rejectLead(context, candidate, "run is not ready to accept leads");
	}
	if (
		(!context.radar && run.leads.size >= context.quota) ||
		(context.radar && context.acceptedLead)
	) {
		return rejectLead(context, candidate, "verified lead quota reached");
	}
	if (
		run.leads.has(lead.id) ||
		[...run.leads.values()].some(
			(existing) =>
				existing.signal.hash === lead.signal.hash ||
				isSimilarLeadEntity(existing, lead),
		)
	) {
		return rejectLead(context, candidate, "duplicate entity or signal");
	}
	if (await recallDuplicate(context.runId, leadEntitySummary(lead))) {
		return rejectLead(context, candidate, "duplicate entity or signal");
	}

	const fetchedAt = new Date().toISOString();
	const extracts = await extractWeb(context, [lead.signal.url], "tavily");
	const evidence = extracts.find(
		(result) => new URL(result.url).href === new URL(lead.signal.url).href,
	);
	const freshContent =
		evidence && !evidence.synthetic && evidence.rawContent.trim().length > 0
			? evidence.rawContent
			: undefined;
	// Adversarial re-verification is a feature: a fresh re-fetch that no longer
	// contains the quote still kills the lead (the demo money-moment). But a
	// TRANSIENT re-fetch failure must not drop a lead whose evidence this run
	// already validated in the gauntlet — fall back to that validated content.
	const verifyContent = freshContent ?? verifiedContent;
	if (!verifyContent) {
		return rejectLead(context, candidate, "source could not be re-fetched");
	}

	const matchScore = quoteMatchScore(lead.signal.quote, verifyContent);
	if (matchScore < EVIDENCE_THRESHOLD) {
		return rejectLead(
			context,
			candidate,
			`quote match ${matchScore.toFixed(2)} is below 0.80`,
		);
	}

	const previous = leadSaveQueues.get(context.runId) ?? Promise.resolve();
	let release = () => {};
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	leadSaveQueues.set(context.runId, current);
	await previous;
	let memoryWrite = Promise.resolve();
	try {
		run = getRun(context.runId);
		if (!run) throw new Error(`Unknown run: ${context.runId}`);
		if (
			(!context.radar && (run.state !== "HUNTING" || !run.selectedIcpId)) ||
			(context.radar && run.state !== "REVIEW" && run.state !== "RADAR")
		) {
			return rejectLead(context, candidate, "run is not ready to accept leads");
		}
		if (
			(!context.radar && run.leads.size >= context.quota) ||
			(context.radar && context.acceptedLead)
		) {
			return rejectLead(context, candidate, "verified lead quota reached");
		}
		if (
			run.leads.has(lead.id) ||
			[...run.leads.values()].some(
				(existing) =>
					existing.signal.hash === lead.signal.hash ||
					isSimilarLeadEntity(existing, lead),
			)
		) {
			return rejectLead(context, candidate, "duplicate entity or signal");
		}

		memoryWrite = addVerifiedLeadMemory(context.runId, lead).catch((error) => {
			console.warn(
				`[engine] HydraDB lead memory failed for ${lead.id}`,
				error instanceof Error ? error.message : error,
			);
		});
		appendEngineEvent(context.runId, {
			lane: "verifier",
			type: context.radar ? "radar_alert" : "lead_verified",
			payload: lead,
		});
		appendEngineEvent(context.runId, {
			lane: "scorer",
			type: "lead_scored",
			payload: { leadId: lead.id, score: lead.score },
		});
		appendEngineEvent(context.runId, {
			lane: "composer",
			type: "draft_ready",
			payload: { draft, status: "draft" },
		});
		context.acceptedLead = lead;
	} finally {
		release();
		if (leadSaveQueues.get(context.runId) === current) {
			leadSaveQueues.delete(context.runId);
		}
	}

	try {
		await upsertVerifiedLead(lead, {
			fetchedAt,
			quoteMatchScore: matchScore,
		});
	} catch (error) {
		console.warn(
			`[engine] InsForge lead checkpoint failed for ${lead.id}`,
			error instanceof Error ? error.message : error,
		);
	}
	await memoryWrite;
	return {
		accepted: true,
		leadId: lead.id,
		quoteMatchScore: matchScore,
	};
}

function scoreTotal(score: JudgeScore): number {
	return (
		score.pain * 5 +
		score.fit * 5 +
		score.timing * 4 +
		score.reachability * 3 +
		score.evidenceQuality * 3
	);
}

function normalizePublishedAt(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp)
		? new Date(timestamp).toISOString()
		: undefined;
}

function normalizedGrounding(value: string): string {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase("en-US")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

function groundedIn(value: string, sources: string[]): boolean {
	const needle = normalizedGrounding(value);
	return (
		needle.replaceAll(" ", "").length >= 2 &&
		sources.some((source) =>
			` ${normalizedGrounding(source)} `.includes(` ${needle} `),
		)
	);
}

function groundedPublishedAt(
	value: string,
	candidatePublishedAt: string | undefined,
): string {
	if (value === "date_unavailable" || !candidatePublishedAt) {
		return "date_unavailable";
	}
	return Date.parse(value) === Date.parse(candidatePublishedAt)
		? candidatePublishedAt
		: "date_unavailable";
}

function sourceTypeFor(channel: CandidateSignal["channel"]): string {
	return {
		forums: "forum_post",
		github: "github_discussion",
		hn: "hacker_news_post",
		jobs: "job_posting",
		news: "news_article",
		reddit: "reddit_post",
		reviews: "review",
		x: "social_post",
	}[channel];
}

function candidateFromResult(
	result: WebResult,
	channel: CandidateSignal["channel"],
): CandidateSignal | undefined {
	if (result.synthetic) return undefined;
	const quoteCandidate = result.content.replace(/\s+/gu, " ").trim();
	const title = result.title.trim();
	if (!quoteCandidate || !title) return undefined;
	const publishedAt = normalizePublishedAt(result.publishedDate);
	const parsed = CandidateSignalSchema.safeParse({
		url: result.url,
		channel,
		title,
		quoteCandidate,
		...(publishedAt ? { publishedAt } : {}),
		foundBy: `hunter:${channel}`,
	});
	return parsed.success ? parsed.data : undefined;
}

function candidateRecallSummary(candidate: CandidateSignal): string {
	return candidate.authorHandle
		? `Handle: ${candidate.authorHandle}`
		: `Source title: ${candidate.title}`;
}

function createPool(limit: number) {
	let active = 0;
	const waiting: Array<() => void> = [];
	return async function run<T>(task: () => Promise<T>): Promise<T> {
		if (active >= limit) {
			await new Promise<void>((resolve) => waiting.push(resolve));
		}
		active += 1;
		try {
			return await task();
		} finally {
			active -= 1;
			waiting.shift()?.();
		}
	};
}

function rejectCandidate(
	context: HuntContext,
	candidate: CandidateSignal,
	reason: string,
): CandidateOutcome {
	rejectLead(context, candidate, reason);
	return { advanced: false, verified: false };
}

function quotaRejection(
	context: HuntContext,
	candidate: CandidateSignal,
	advanced: boolean,
): CandidateOutcome | undefined {
	if (!quotaReached(context, 0)) return undefined;
	rejectLead(context, candidate, "verified lead quota reached");
	return { advanced, verified: false };
}

function findPage(
	candidate: CandidateSignal,
	extracts: ExtractResult[],
): ExtractResult | undefined {
	return extracts.find(
		(result) => new URL(result.url).href === new URL(candidate.url).href,
	);
}

function enrichmentFor(
	candidate: CandidateSignal,
	company: string | undefined,
	result: Awaited<ReturnType<typeof enrichLead>>,
): Enrichment {
	const contact =
		result.contacts.find((entry) => entry.kind === "public_email") ??
		result.contacts[0];
	const channel = contact
		? {
				kind:
					contact.kind === "public_email"
						? ("public_email" as const)
						: ("public_profile" as const),
				value: contact.value,
				provenanceUrl: contact.provenanceUrl,
			}
		: {
				kind: "thread_reply" as const,
				value: "Reply in source thread",
				provenanceUrl: candidate.url,
			};
	return EnrichmentSchema.parse({
		...(company ? { company } : {}),
		contacts: result.contacts,
		datapoints: result.datapoints,
		channel,
		reachabilityConfidence:
			contact?.kind === "public_email" ? "high" : contact ? "medium" : "low",
	});
}

// A candidate that has already survived the gauntlet, quote gate, and score is a
// real verified lead. Composition must never lose it: retry once on failure, then
// fall back to a deterministic draft grounded only in the verified quote.
async function composeOutreachDraft(lead: Lead): Promise<OutreachDraft> {
	const request = {
		leadId: lead.id,
		channel: lead.enrichment.channel.kind,
		quote: lead.signal.quote,
		groundedIn: [lead.signal.url],
	};
	const base =
		"Compose one founder-written outreach draft of 90 words or fewer. Ground every claim only in the supplied verbatim quote and URL. Do not invent recipient details, context, outcomes, or familiarity. Preserve the supplied leadId, channel, and groundedIn URL exactly. End with one low-friction question.";
	const systems = [
		base,
		`${base} Your previous attempt was rejected for being too long. The body MUST be 90 words or fewer — count the words and trim before responding.`,
	];
	for (const system of systems) {
		try {
			return await oneShot({
				model: "claude-haiku-4-5",
				schema: OutreachDraftSchema,
				system,
				user: JSON.stringify(request),
			});
		} catch (error) {
			console.warn(
				`[engine] composer attempt failed for ${lead.id}`,
				error instanceof Error ? error.message : error,
			);
		}
	}
	const trimmedQuote = lead.signal.quote.split(/\s+/u).slice(0, 40).join(" ");
	return OutreachDraftSchema.parse({
		leadId: lead.id,
		channel: lead.enrichment.channel.kind,
		body: `You wrote: "${trimmedQuote}". That is exactly the problem we are working on. Would you be open to a short note on how we are approaching it?`,
		groundedIn: [lead.signal.url],
	});
}

async function processCandidate(
	context: HuntContext,
	icp: ICPHypothesis,
	candidate: CandidateSignal,
): Promise<CandidateOutcome> {
	let advanced = false;
	try {
		const alreadyAtQuota = quotaRejection(context, candidate, advanced);
		if (alreadyAtQuota) return alreadyAtQuota;

		const extracts = await extractWeb(context, [candidate.url], "tavily");
		const page = findPage(candidate, extracts);
		if (!page?.rawContent.trim() || page.synthetic) {
			return rejectCandidate(context, candidate, "source could not be fetched");
		}
		const quotaAfterFetch = quotaRejection(context, candidate, advanced);
		if (quotaAfterFetch) return quotaAfterFetch;

		// Reddit and X render their content in JavaScript, so a re-fetch strips to
		// boilerplate. The search engine's own crawl (the candidate's indexed
		// title + snippet) is real quotable content from this exact URL — supply it
		// alongside the re-fetched text so JS-walled sources still verify on real
		// evidence. The quote gate and identity grounding run against this same text.
		const indexedExcerpt = [candidate.title, candidate.quoteCandidate]
			.filter((part) => part && part.trim().length > 0)
			.join("\n");
		const evidenceText =
			`INDEXED EXCERPT (search-engine crawl of this exact URL — real and quotable):\n${indexedExcerpt}\n\nRE-FETCHED PAGE TEXT:\n${page.rawContent}`.slice(
				0,
				8_000,
			);

		const judgment = await oneShot({
			model: "claude-sonnet-5",
			schema: GauntletJudgmentSchema,
			system: `You are CustomerZero's adversarial gauntlet judge. REJECT by default. Advance only when the supplied page text contains a verbatim quote in which a real, identifiable person or company expresses pain relevant to the ICP. Copy the quote exactly from PAGE TEXT. Never invent or infer a name, handle, company, date, quote, or source detail. Use date_unavailable when the page and candidate metadata do not provide a date. An advance verdict must include extracted, person, score, whyFit, and whyNow. Score each dimension from 0 to 5 using this rubric: pain 25%, fit 25%, timing 20%, reachability 15%, evidence quality 15%. Do not provide a total; code computes it.`,
			user: `ICP:\n${JSON.stringify(icp)}\n\nCANDIDATE:\n${JSON.stringify(candidate)}\n\nPAGE TEXT (first 8000 characters):\n${evidenceText}`,
		});
		const quotaAfterJudgment = quotaRejection(context, candidate, advanced);
		if (quotaAfterJudgment) return quotaAfterJudgment;

		if (judgment.verdict === "reject") {
			return rejectCandidate(
				context,
				candidate,
				judgment.rejectReason ?? "no quoted ICP-relevant pain",
			);
		}
		if (
			!judgment.extracted ||
			!judgment.person ||
			!judgment.score ||
			!judgment.whyFit ||
			!judgment.whyNow ||
			/^(?:anonymous|n\/?a|unknown|unavailable)$/iu.test(judgment.person.name)
		) {
			return rejectCandidate(
				context,
				candidate,
				"judge did not return complete grounded evidence",
			);
		}
		if (!passesEvidenceGate(judgment.extracted.quote, evidenceText)) {
			return rejectCandidate(context, candidate, "quote not found on re-fetch");
		}
		const groundingSources = [
			evidenceText,
			candidate.title,
			candidate.quoteCandidate,
		];
		if (!groundedIn(judgment.person.name, groundingSources)) {
			return rejectCandidate(
				context,
				candidate,
				"judge identity not found in source",
			);
		}
		const authorHandle =
			judgment.extracted.authorHandle &&
			groundedIn(judgment.extracted.authorHandle, groundingSources)
				? judgment.extracted.authorHandle
				: undefined;
		const authorDisplay =
			judgment.extracted.authorDisplay &&
			groundedIn(judgment.extracted.authorDisplay, groundingSources)
				? judgment.extracted.authorDisplay
				: undefined;
		const company =
			judgment.extracted.company &&
			groundedIn(judgment.extracted.company, groundingSources)
				? judgment.extracted.company
				: undefined;

		const score = ScoreBreakdownSchema.parse({
			...judgment.score,
			total: scoreTotal(judgment.score),
		});
		if (score.total < SCORE_THRESHOLD) {
			return rejectCandidate(context, candidate, "below score threshold");
		}
		advanced = true;
		const quotaAfterScore = quotaRejection(context, candidate, advanced);
		if (quotaAfterScore) return quotaAfterScore;

		const enrichmentResult = await enrichLead(
			{
				name: judgment.person.name,
				...(company ? { company } : {}),
				signalUrl: candidate.url,
				channelHint: candidate.channel,
			},
			context.runId,
		);
		const quotaAfterEnrichment = quotaRejection(context, candidate, advanced);
		if (quotaAfterEnrichment) return quotaAfterEnrichment;
		const hash = signalHash(candidate.url, authorHandle);
		const leadId = createHash("sha256")
			.update(`${context.runId}:${hash}`)
			.digest("hex")
			.slice(0, 24);
		const lead = LeadSchema.parse({
			id: `lead-${leadId}`,
			runId: context.runId,
			name: judgment.person.name,
			type: judgment.person.type,
			signal: {
				url: candidate.url,
				channel: candidate.channel,
				quote: judgment.extracted.quote,
				...(authorHandle ? { authorHandle } : {}),
				...(authorDisplay ? { authorDisplay } : {}),
				...(company ? { company } : {}),
				publishedAt: groundedPublishedAt(
					judgment.extracted.publishedAt,
					candidate.publishedAt,
				),
				sourceType: sourceTypeFor(candidate.channel),
				hash,
			},
			score,
			enrichment: enrichmentFor(candidate, company, enrichmentResult),
			whyFit: judgment.whyFit,
			whyNow: judgment.whyNow,
		});
		const quotaBeforeComposer = quotaRejection(context, candidate, advanced);
		if (quotaBeforeComposer) return quotaBeforeComposer;
		const draft = await composeOutreachDraft(lead);
		const quotaBeforeFinalization = quotaRejection(
			context,
			candidate,
			advanced,
		);
		if (quotaBeforeFinalization) return quotaBeforeFinalization;
		const finalized = await finalizeVerifiedLead(
			context,
			candidate,
			lead,
			draft,
			evidenceText,
		);
		return { advanced: true, verified: finalized.accepted };
	} catch (error) {
		console.warn(
			`[engine] candidate pipeline failed for ${candidate.url}`,
			error instanceof Error ? error.message : error,
		);
		rejectLead(context, candidate, "candidate pipeline failed");
		return { advanced, verified: false };
	} finally {
		emitBudget(context);
	}
}

function seenSignalHashes(runId: string): Set<string> {
	const hashes = new Set<string>();
	for (const event of getRun(runId)?.events ?? []) {
		if (event.type === "signal_found") {
			hashes.add(signalHash(event.payload.url, event.payload.authorHandle));
		}
		if (event.type === "lead_verified" || event.type === "radar_alert") {
			hashes.add(event.payload.signal.hash);
		}
	}
	return hashes;
}

function quotaReached(context: HuntContext, verifiedCount: number): boolean {
	if (context.radar) {
		return verifiedCount >= context.quota || Boolean(context.acceptedLead);
	}
	return (getRun(context.runId)?.leads.size ?? verifiedCount) >= context.quota;
}

function budgetExhausted(context: HuntContext): boolean {
	const budget = getTavilyBudget(context.runId);
	return budget.spent >= budget.total;
}

export async function runConveyorHunt(
	context: HuntContext,
	icp: ICPHypothesis,
	plan: QueryPlan,
): Promise<number> {
	const run = getRun(context.runId);
	if (!run) throw new Error(`Unknown run: ${context.runId}`);
	if (run.selectedIcpId !== icp.id || plan.icpId !== icp.id) {
		throw new Error(
			"Conveyor ICP and QueryPlan do not match the confirmed ICP",
		);
	}

	const seen = seenSignalHashes(context.runId);
	const pool = createPool(3);
	let verifiedCount = 0;

	for (let packIndex = 0; packIndex < plan.packs.length; packIndex += 1) {
		if (quotaReached(context, verifiedCount) || budgetExhausted(context)) break;
		const pack = plan.packs[packIndex];
		let advancingCount = 0;
		const packTasks: Array<Promise<CandidateOutcome>> = [];

		for (const queryText of pack.queries) {
			if (quotaReached(context, verifiedCount) || budgetExhausted(context)) {
				break;
			}
			const results = await searchWeb(
				context,
				scopeQueryToChannel(queryText, pack.channel),
				pack.provider,
			);
			if (quotaReached(context, verifiedCount)) break;
			await Promise.all(
				results.map(async (result) => {
					// Defense in depth: a single malformed result must never crash the
					// run. Any throw here (bad URL, hash, recall) drops just this result.
					try {
						if (quotaReached(context, verifiedCount)) return;
						const candidate = candidateFromResult(result, pack.channel);
						if (!candidate) return;
						const hash = signalHash(candidate.url, candidate.authorHandle);
						if (seen.has(hash)) return;
						seen.add(hash);
						if (
							await recallDuplicate(
								context.runId,
								candidateRecallSummary(candidate),
							)
						) {
							return;
						}
						if (quotaReached(context, verifiedCount)) return;
						appendEngineEvent(context.runId, {
							lane: `hunter:${pack.channel}`,
							type: "signal_found",
							payload: candidate,
						});
						packTasks.push(
							pool(() => processCandidate(context, icp, candidate)),
						);
					} catch (error) {
						console.warn(
							"[engine] dropped malformed search result",
							error instanceof Error ? error.message : error,
						);
					}
				}),
			);
		}
		const outcomes = await Promise.all(packTasks);
		advancingCount = outcomes.filter((outcome) => outcome.advanced).length;
		verifiedCount += outcomes.filter((outcome) => outcome.verified).length;

		const nextPack = plan.packs[packIndex + 1];
		if (
			advancingCount === 0 &&
			nextPack &&
			!quotaReached(context, verifiedCount) &&
			!budgetExhausted(context)
		) {
			appendEngineEvent(context.runId, {
				lane: "hunt-strategist",
				type: "strategy_pivot",
				payload: {
					rationale: `${pack.channel} ${pack.bucket} pack produced no advancing candidates; pivoting to ${nextPack.channel} ${nextPack.bucket}.`,
				},
			});
		}
	}

	return verifiedCount;
}
