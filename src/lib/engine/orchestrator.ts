import { createHash } from "node:crypto";
import {
	type AgentDefinition,
	type AnyZodRawShape,
	createSdkMcpServer,
	type HookCallback,
	query,
	type SDKMessage,
	type SDKUserMessage,
	type SdkMcpToolDefinition,
	tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
	append,
	getRun,
	type RunDepth,
	waitForIcpConfirmation,
} from "@/lib/run-store";
import {
	type CandidateSignal,
	CandidateSignalSchema,
	type Lead,
	LeadSchema,
	type OutreachDraft,
	OutreachDraftSchema,
	type QueryPack,
	type RunEvent,
	RunEventSchema,
} from "@/lib/schemas";
import { enrichLead } from "./enrich";
import { quoteMatchScore } from "./evidence";
import { postToRoom } from "./tools/band";
import {
	addVerifiedLeadMemory,
	leadEntitySummary,
	recallDuplicate,
} from "./tools/hydradb";
import {
	ensureInsForgeTables,
	upsertRun,
	upsertVerifiedLead,
} from "./tools/insforge";
import { extractNimble, searchNimble } from "./tools/nimble";
import {
	extractTavily,
	getTavilyBudget,
	resetTavilyBudget,
	searchTavily,
} from "./tools/tavily";
import { searchYouCom } from "./tools/youcom";

type EngineEventInput = RunEvent extends infer Event
	? Event extends RunEvent
		? Omit<Event, "runId" | "seq" | "ts">
		: never
	: never;

interface OrchestratorInput {
	runId: string;
	domain: string;
	depth: RunDepth;
}

interface RunContext extends OrchestratorInput {
	quota: number;
	radar: boolean;
	lastBudgetSpent: number;
	agentLanes: Map<string, string>;
	acceptedLead?: Lead;
}

interface WebResult {
	title: string;
	url: string;
	content: string;
	publishedDate?: string;
	synthetic?: boolean;
	provider: "tavily" | "youcom" | "nimble";
}

interface AgentInvocationPolicy {
	limits?: Record<string, number>;
	required?: string[];
	maxConcurrent?: Record<string, number>;
}

const CompletionSchema = z
	.object({
		status: z.enum(["REVIEW", "RADAR"]),
		verifiedLeadCount: z.number().int().nonnegative(),
	})
	.strict();

const eventPayloadReference = `EVENT PAYLOAD REFERENCE (strict JSON; no extra keys; ? = optional):
stage_change: { state: INTAKE|ICP_CONFIRM|STRATEGY|HUNTING|REVIEW|DELIVERED|RADAR|FAILED|KILLED, domain?: string, brief?: ProductBrief, icps?: ICPHypothesis[2..3] (key is "icps", never "hypotheses"), queryPlan?: QueryPlan }
agent_started: { agent: string, message: string } · tool_call: { tool: string, action: string }
signal_found: CandidateSignal { url: http(s) URL, channel: reddit|hn|x|reviews|github|jobs|forums|news, title: string, authorHandle?: string, quoteCandidate: string, publishedAt?: ISO datetime with offset, foundBy: string } · signal_rejected: { signal: CandidateSignal, reason: string }
lead_verified: Lead · lead_scored: { leadId: string, score: ScoreBreakdown } · draft_ready: { draft: OutreachDraft, status: draft|sent } · radar_alert: Lead
strategy_pivot: { rationale: string } · budget_update: { spent: number >= 0, total: number >= 0, provider?: tavily|youcom|nimble } · error: { message: string, recoverable: boolean }
ProductBrief (all fields required): { domain: string, product: string, outcome: string, buyer: string, user: string, priceMotion: string, geography: string, topUseCase: string, inferences: string[] }
ICPHypothesis (all fields required): { id: string, persona: string, industry: string, companySize: string, painTriggers: string[1..], positiveSignals: string[1..], disqualifiers: string[] (may be []), vocabulary: string[1..] }
QueryPlan: { icpId: string, packs: { bucket: demand|pain|workaround|switching|timing, channel: reddit|hn|x|reviews|github|jobs|forums|news, provider: tavily|youcom|nimble, queries: string[1..] }[1..], budget: { providers: { provider: tavily|youcom|nimble, allocated: number >= 0 }[1..] } }
ScoreBreakdown: { pain: 0..5, fit: 0..5, timing: 0..5, reachability: 0..5, evidenceQuality: 0..5, total: 0..100, stage: high_intent|problem_aware|trigger_present }
OutreachDraft: { leadId: string, channel: string, subject?: string, body: string (1..90 words), groundedIn: http(s) URL[1..] }
emit_event accepts only stage_change|agent_started|tool_call|signal_found|signal_rejected|strategy_pivot|error. save_lead/system code emits lead_verified|lead_scored|draft_ready|radar_alert|budget_update.`;

const mirrorTypes = new Set<RunEvent["type"]>([
	"stage_change",
	"strategy_pivot",
	"lead_verified",
	"signal_rejected",
	"radar_alert",
]);
const leadSaveQueues = new Map<string, Promise<void>>();

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function shortText(value: string, fallback: string): string {
	const normalized = value.replace(/\s+/gu, " ").trim();
	return (normalized || fallback).slice(0, 220);
}

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

function signalHash(url: string, authorHandle?: string): string {
	const normalizedUrl = new URL(url);
	normalizedUrl.hash = "";
	normalizedUrl.hostname = normalizedUrl.hostname.toLocaleLowerCase("en-US");
	normalizedUrl.searchParams.sort();
	const normalized = normalizedUrl.toString().replace(/\/$/u, "");
	return createHash("sha256")
		.update(`${normalized}${authorHandle ?? ""}`)
		.digest("hex");
}

async function persistRunState(context: RunContext): Promise<void> {
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

function emitBudget(context: RunContext): void {
	const budget = getTavilyBudget(context.runId);
	if (budget.spent === context.lastBudgetSpent) return;
	context.lastBudgetSpent = budget.spent;
	appendEngineEvent(context.runId, {
		lane: "system",
		type: "budget_update",
		payload: { ...budget, provider: "tavily" },
	});
}

function providerOrder(
	requested?: "tavily" | "youcom" | "nimble",
): Array<"tavily" | "youcom" | "nimble"> {
	const providers = ["tavily", "youcom", "nimble"] as const;
	return requested
		? [requested, ...providers.filter((provider) => provider !== requested)]
		: [...providers];
}

async function searchWeb(
	context: RunContext,
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
			if (results.length > 0) {
				return results.map((result) => ({ ...result, provider }));
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

async function extractWeb(
	context: RunContext,
	urls: string[],
	requested?: "tavily" | "nimble",
): Promise<
	Array<{
		url: string;
		rawContent: string;
		provider: string;
		synthetic?: boolean;
	}>
> {
	const availableProviders = ["tavily", "nimble"] as const;
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
					: await extractNimble(urls);
			if (provider === "tavily") emitBudget(context);
			if (results.length > 0) {
				return results.map((result) => ({ ...result, provider }));
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

function jsonResult(value: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value) }],
	};
}

async function rejectLead(
	context: RunContext,
	candidate: CandidateSignal,
	reason: string,
) {
	appendEngineEvent(context.runId, {
		lane: "verifier",
		type: "signal_rejected",
		payload: { signal: candidate, reason },
	});
	return jsonResult({ accepted: false, reason });
}

async function saveLeadUnlocked(
	context: RunContext,
	candidateInput: CandidateSignal,
	leadInput: Lead,
	draftInput: OutreachDraft,
) {
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

	const run = getRun(context.runId);
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
		return jsonResult({
			accepted: false,
			reason: "verified lead quota reached",
		});
	}

	lead = LeadSchema.parse({
		...lead,
		signal: {
			...lead.signal,
			hash: signalHash(lead.signal.url, lead.signal.authorHandle),
		},
	});
	if (
		run.leads.has(lead.id) ||
		[...run.leads.values()].some(
			(existing) => existing.signal.hash === lead.signal.hash,
		) ||
		(await recallDuplicate(context.runId, leadEntitySummary(lead)))
	) {
		return rejectLead(context, candidate, "duplicate entity or signal");
	}

	const fetchedAt = new Date().toISOString();
	const extracts = await extractWeb(context, [lead.signal.url], "tavily");
	const evidence = extracts.find(
		(result) => new URL(result.url).href === new URL(lead.signal.url).href,
	);
	if (!evidence?.rawContent) {
		return rejectLead(context, candidate, "source could not be re-fetched");
	}
	if (evidence.synthetic) {
		return rejectLead(
			context,
			candidate,
			"synthetic extraction is not evidence",
		);
	}

	const matchScore = quoteMatchScore(lead.signal.quote, evidence.rawContent);
	if (matchScore < 0.8) {
		return rejectLead(
			context,
			candidate,
			`quote match ${matchScore.toFixed(2)} is below 0.80`,
		);
	}
	if (lead.score.total < 65) {
		return rejectLead(
			context,
			candidate,
			`score ${lead.score.total} is below the qualifying threshold of 65`,
		);
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
	await addVerifiedLeadMemory(context.runId, lead);

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
	return jsonResult({
		accepted: true,
		leadId: lead.id,
		quoteMatchScore: matchScore,
	});
}

async function saveLead(
	context: RunContext,
	candidate: CandidateSignal,
	lead: Lead,
	draft: OutreachDraft,
) {
	const previous = leadSaveQueues.get(context.runId) ?? Promise.resolve();
	let release = () => {};
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	leadSaveQueues.set(context.runId, current);
	await previous;
	try {
		return await saveLeadUnlocked(context, candidate, lead, draft);
	} finally {
		release();
		if (leadSaveQueues.get(context.runId) === current) {
			leadSaveQueues.delete(context.runId);
		}
	}
}

function assertValidStageChange(
	context: RunContext,
	event: Extract<RunEvent, { type: "stage_change" }>,
): void {
	const run = getRun(context.runId);
	if (!run) throw new Error(`Unknown run: ${context.runId}`);
	const { state } = event.payload;

	if (state === "INTAKE") {
		if (
			run.state !== "INTAKE" ||
			run.selectedIcpId ||
			event.payload.domain !== context.domain ||
			!event.payload.brief
		) {
			throw new Error("INTAKE requires the submitted domain and ProductBrief");
		}
		return;
	}
	if (state === "ICP_CONFIRM") {
		const ids = event.payload.icps?.map((icp) => icp.id) ?? [];
		if (
			run.state !== "INTAKE" ||
			event.payload.domain !== context.domain ||
			!event.payload.brief ||
			ids.length < 2 ||
			new Set(ids).size !== ids.length
		) {
			throw new Error(
				"ICP_CONFIRM requires a ProductBrief and 2-3 uniquely identified hypotheses",
			);
		}
		return;
	}
	if (state === "STRATEGY") {
		if (
			(run.state !== "ICP_CONFIRM" && run.state !== "HUNTING") ||
			!run.selectedIcpId ||
			event.payload.queryPlan?.icpId !== run.selectedIcpId
		) {
			throw new Error("STRATEGY requires the founder-confirmed ICP query plan");
		}
		return;
	}
	if (state === "HUNTING") {
		if (
			run.state !== "STRATEGY" ||
			!run.selectedIcpId ||
			event.payload.queryPlan?.icpId !== run.selectedIcpId
		) {
			throw new Error("HUNTING requires the active confirmed-ICP query plan");
		}
		return;
	}
	if (state === "REVIEW") {
		if (run.state !== "HUNTING" || !run.selectedIcpId) {
			throw new Error("REVIEW requires a completed confirmed-ICP hunt");
		}
		return;
	}

	throw new Error(`The orchestrator cannot emit stage ${state}`);
}

function createTools(context: RunContext) {
	const providerSchema = z.enum(["tavily", "youcom", "nimble"]);
	const saveLeadExample = JSON.stringify({
		id: "lead-1",
		runId: context.runId,
		name: "Ari Chen",
		type: "person",
		signal: {
			url: "https://example.com/thread/1",
			channel: "forums",
			quote: "Manual intake costs us hours every week.",
			publishedAt: "2026-07-01T12:00:00Z",
			sourceType: "forum_post",
			hash: "0".repeat(64),
		},
		score: {
			pain: 4,
			fit: 4,
			timing: 4,
			reachability: 4,
			evidenceQuality: 4,
			total: 80,
			stage: "problem_aware",
		},
		enrichment: {
			channel: {
				kind: "thread_reply",
				value: "Reply in source thread",
				provenanceUrl: "https://example.com/thread/1",
			},
			reachabilityConfidence: "high",
		},
		whyFit: "Matches the confirmed ICP.",
		whyNow: "They described a current recurring problem.",
	});
	return [
		tool(
			"web_search",
			"Search the public web. Results may be synthetic and are clearly labeled when a provider key is absent.",
			{
				query: z.string().min(1),
				provider: providerSchema.optional(),
				maxResults: z.number().int().min(1).max(10).optional(),
			},
			async (args) =>
				jsonResult(
					await searchWeb(context, args.query, args.provider, args.maxResults),
				),
		),
		tool(
			"web_extract",
			"Fetch public page content. The verifier must use this before proposing a lead.",
			{
				urls: z.array(z.string().url()).min(1).max(5),
				provider: z.enum(["tavily", "nimble"]).optional(),
			},
			async (args) =>
				jsonResult(await extractWeb(context, args.urls, args.provider)),
		),
		tool(
			"memory_recall",
			"Check whether an entity or signal was already seen in this run.",
			{ entitySummary: z.string().min(1) },
			async ({ entitySummary: summary }) =>
				jsonResult({
					duplicate: await recallDuplicate(context.runId, summary),
				}),
		),
		tool(
			"memory_add",
			"Store a verified lead in run-scoped memory.",
			{ lead: LeadSchema },
			async ({ lead }) => {
				const parsed = LeadSchema.parse(lead);
				const stored = getRun(context.runId)?.leads.get(parsed.id);
				if (
					parsed.runId !== context.runId ||
					stored?.signal.hash !== parsed.signal.hash
				) {
					throw new Error(
						"memory_add only accepts a lead verified in this run",
					);
				}
				await addVerifiedLeadMemory(context.runId, stored);
				return jsonResult({ stored: true });
			},
		),
		tool(
			"enrich_lead",
			"Search public sources for cited lead contacts and independent enrichment datapoints. Returned values are the only allowed source of lead datapoints.",
			{
				name: z.string().min(1),
				company: z.string().min(1).optional(),
				signalUrl: z.string().url(),
				channelHint: z.string().min(1).optional(),
			},
			async (args) => jsonResult(await enrichLead(args, context.runId)),
		),
		tool(
			"save_lead",
			`Validate and save one fully composed lead. This independently re-fetches and quote-matches evidence; it is the only path that can emit a verified lead. Fully-valid fictional Lead example (copy the shape, replace the values): ${saveLeadExample}`,
			{
				candidate: CandidateSignalSchema,
				lead: LeadSchema,
				draft: OutreachDraftSchema,
			},
			async ({ candidate, lead, draft }) =>
				saveLead(context, candidate, lead, draft),
		),
		tool(
			"emit_event",
			`Append a validated run event. Never use this for lead_verified or radar_alert; use save_lead.\n${eventPayloadReference}`,
			{
				lane: z.string().min(1),
				type: z.enum([
					"stage_change",
					"agent_started",
					"tool_call",
					"signal_found",
					"signal_rejected",
					"strategy_pivot",
					"error",
				]),
				payload: z.record(z.string(), z.unknown()),
			},
			async (args) => {
				const event = RunEventSchema.parse({
					runId: context.runId,
					ts: new Date().toISOString(),
					seq: (getRun(context.runId)?.events.at(-1)?.seq ?? 0) + 1,
					lane: args.lane,
					type: args.type,
					payload: args.payload,
				});
				if (event.type === "stage_change") {
					assertValidStageChange(context, event);
				}
				append(context.runId, event);
				if (mirrorTypes.has(event.type)) {
					void postToRoom(context.runId, mirrorText(event));
				}
				if (event.type === "stage_change") {
					await persistRunState(context);
					if (event.payload.state === "ICP_CONFIRM") {
						return jsonResult({
							emitted: true,
							awaitingIcpSelection: true,
						});
					}
				}
				return jsonResult({ emitted: true });
			},
		),
		tool(
			"budget_read",
			"Read the run's Tavily spend, lead count, and lead quota.",
			{},
			async () => {
				const run = getRun(context.runId);
				return jsonResult({
					...getTavilyBudget(context.runId),
					verifiedLeads: run?.leads.size ?? 0,
					leadQuota: context.quota,
				});
			},
		),
	];
}

const mcpTool = (name: string) => `mcp__customerzero__${name}`;

const agentDefinitions = {
	"intake-analyst": {
		description:
			"Analyze a submitted product domain into a strict ProductBrief.",
		prompt:
			"Use web_extract and web_search. Return only a ProductBrief JSON object grounded in the submitted domain. Mark uncertainty in inferences.",
		model: "claude-sonnet-5",
		tools: [mcpTool("web_extract"), mcpTool("web_search")],
		maxTurns: 6,
	},
	"icp-architect": {
		description: "Create two or three falsifiable ICP hypotheses from a brief.",
		prompt:
			"Return only a JSON array of 2-3 ICPHypothesis objects. Avoid protected traits and include disqualifiers and audience vocabulary.",
		model: "claude-sonnet-5",
		tools: [],
		maxTurns: 6,
	},
	"hunt-strategist": {
		description: "Turn one confirmed ICP into a five-bucket QueryPlan.",
		prompt:
			"Return only one QueryPlan JSON object covering demand, pain, workaround, switching, and timing across public channels.",
		model: "claude-sonnet-5",
		tools: [],
		maxTurns: 6,
	},
	hunter: {
		description:
			"Execute one public-web query pack and return candidate signals.",
		prompt:
			"Use web_search. Prefer original public pages. Return only CandidateSignal JSON objects with exact snippet-derived quoteCandidate values. Clearly retain synthetic labels.",
		model: "claude-sonnet-5",
		tools: [mcpTool("web_search"), mcpTool("budget_read")],
		maxTurns: 12,
	},
	extractor: {
		description: "Extract one candidate into a typed signal.",
		prompt:
			"Use web_extract. Return only one ExtractedSignal JSON object. Never invent a quote, URL, date, or identity.",
		model: "claude-haiku-4-5",
		tools: [mcpTool("web_extract")],
		maxTurns: 6,
	},
	verifier: {
		description: "Adversarially verify one extracted public signal.",
		prompt:
			"Default REJECT. Independently use web_extract, check exact quote support, authorship, and recency, then return only one Verdict JSON object. Never rely on search snippets alone.",
		model: "claude-sonnet-5",
		tools: [mcpTool("web_extract"), mcpTool("memory_recall")],
		maxTurns: 8,
	},
	enricher: {
		description: "Find minimal public business context and a natural channel.",
		prompt:
			"Use public pages only. You MUST call enrich_lead and merge its returned contacts and datapoints unchanged into the Lead enrichment before save_lead. The LLM may not invent or alter datapoints; only tool output is allowed. Return one Enrichment JSON object. Never guess emails or infer protected traits.",
		model: "claude-sonnet-5",
		tools: [
			mcpTool("web_search"),
			mcpTool("web_extract"),
			mcpTool("enrich_lead"),
		],
		maxTurns: 8,
	},
	scorer: {
		description: "Score a verified signal on the CustomerZero evidence rubric.",
		prompt:
			"Return only one ScoreBreakdown JSON object. Score pain/fit/timing/reachability/evidenceQuality 0-5 and total 0-100.",
		model: "claude-sonnet-5",
		tools: [],
		maxTurns: 4,
	},
	composer: {
		description: "Compose a short evidence-grounded outreach draft.",
		prompt:
			"Return only one OutreachDraft JSON object of at most 90 words, grounded exclusively in the verified URL, with one low-friction question.",
		model: "claude-sonnet-5",
		tools: [],
		maxTurns: 4,
	},
} satisfies Record<string, AgentDefinition>;

function orchestrationPrompt(context: RunContext): string {
	return `You are CustomerZero's orchestrator for run ${context.runId}.
Domain: ${context.domain}
Verified lead quota: ${context.quota}; hard maximum 10. Tavily budget: 300 credits.

Use the Agent tool for every specialist. Use only the CustomerZero MCP tools for external actions. Never use filesystem or shell tools. Do not expose hidden reasoning.

Flow:
1. Delegate to intake-analyst. Emit a stage_change INTAKE containing domain and the strict ProductBrief.
2. Delegate to icp-architect. Emit stage_change ICP_CONFIRM containing domain, brief, and 2-3 strict ICP hypotheses. Stop after that tool call and wait for the founder's selection in the next user message.
3. Delegate to hunt-strategist. Emit STRATEGY with a strict QueryPlan, then HUNTING with the same plan.
4. Run hunter agents in batches of at most four. STREAM RESULTS: emit signal_found the moment each candidate is discovered — never hold candidates back. Then pipeline each candidate INDIVIDUALLY through extractor, memory_recall, verifier, enricher, scorer, and composer, and call save_lead IMMEDIATELY when that single candidate passes verification — never batch verified leads for a later save. The founder is watching live; every found/rejected/verified moment must appear in real time. Reject anything unsupported with signal_rejected as soon as it fails. Only call save_lead after verifier re-fetches the URL and supports the quote. save_lead enforces evidence again.
5. Continue until quota, no viable signals, or budget floor. Call budget_read between waves. Emit visible strategy_pivot events when changing lanes.
6. Emit stage_change REVIEW. End with structured status REVIEW and the actual verified lead count.

Every emit_event payload must exactly match the existing RunEvent schema. Never emit lead_verified or radar_alert directly.

${eventPayloadReference}`;
}

async function* gatedOrchestrationPrompt(
	context: RunContext,
): AsyncGenerator<SDKUserMessage> {
	yield {
		type: "user",
		message: { role: "user", content: orchestrationPrompt(context) },
		parent_tool_use_id: null,
	};
	const selectedIcpId = await waitForIcpConfirmation(context.runId);
	yield {
		type: "user",
		message: {
			role: "user",
			content: `The founder selected ICP ${selectedIcpId}. Continue from STRATEGY using only that ICP.`,
		},
		parent_tool_use_id: null,
	};
}

function sdkLane(context: RunContext, message: SDKMessage): string {
	if (
		(message.type === "assistant" || message.type === "user") &&
		"subagent_type" in message &&
		typeof message.subagent_type === "string"
	) {
		return message.subagent_type;
	}
	if (
		"parent_tool_use_id" in message &&
		typeof message.parent_tool_use_id === "string"
	) {
		const lane = context.agentLanes.get(message.parent_tool_use_id);
		if (lane) return lane;
	}
	if (message.type === "tool_progress") {
		const lane = context.agentLanes.get(message.tool_use_id);
		if (lane) return lane;
	}
	return "orchestrator";
}

function routeSdkMessage(context: RunContext, message: SDKMessage): void {
	const lane = sdkLane(context, message);
	if (message.type === "assistant") {
		let emitted = false;
		for (const block of message.message.content) {
			if (block.type === "text") {
				emitted = true;
				appendEngineEvent(context.runId, {
					lane,
					type: "agent_started",
					payload: {
						agent: lane,
						message: shortText(block.text, "Agent response received"),
					},
				});
			}
			if (block.type === "tool_use") {
				emitted = true;
				const input = asRecord(block.input);
				const delegatedAgent =
					typeof input?.subagent_type === "string"
						? input.subagent_type
						: undefined;
				if (delegatedAgent) {
					context.agentLanes.set(block.id, delegatedAgent);
				}
				appendEngineEvent(context.runId, {
					lane,
					type: "tool_call",
					payload: {
						tool: block.name.replace(/^mcp__customerzero__/u, ""),
						action: delegatedAgent
							? `Delegating to ${delegatedAgent}`
							: `Calling ${block.name.replace(/^mcp__customerzero__/u, "")}`,
					},
				});
			}
		}
		if (!emitted) {
			appendEngineEvent(context.runId, {
				lane,
				type: "agent_started",
				payload: { agent: lane, message: "Agent response received" },
			});
		}
		return;
	}

	if (message.type === "result") {
		appendEngineEvent(context.runId, {
			lane: "orchestrator",
			type: "agent_started",
			payload: {
				agent: "orchestrator",
				message:
					message.subtype === "success"
						? "Claude orchestration completed"
						: `Claude orchestration stopped: ${message.subtype}`,
			},
		});
		return;
	}

	if (message.type === "tool_progress") {
		appendEngineEvent(context.runId, {
			lane,
			type: "tool_call",
			payload: {
				tool: message.tool_name,
				action: `${message.tool_name} running for ${Math.round(message.elapsed_time_seconds)}s`,
			},
		});
		return;
	}

	if (message.type === "system" && message.subtype === "init") {
		appendEngineEvent(context.runId, {
			lane: "orchestrator",
			type: "agent_started",
			payload: {
				agent: "orchestrator",
				message: `Claude session initialized with ${message.model}`,
			},
		});
		return;
	}

	if (message.type === "user") {
		appendEngineEvent(context.runId, {
			lane,
			type: "agent_started",
			payload: { agent: lane, message: "Agent tool result received" },
		});
		return;
	}

	const subtype = "subtype" in message ? String(message.subtype) : message.type;
	appendEngineEvent(context.runId, {
		lane: "orchestrator",
		type: "agent_started",
		payload: {
			agent: "orchestrator",
			message: `SDK ${message.type}: ${subtype}`,
		},
	});
}

function agentLimitHook(
	policy: AgentInvocationPolicy,
	invocations: Map<string, number>,
	activeAgents: Map<string, Set<string>>,
	toolAgents: Map<string, string>,
): HookCallback {
	return async (input, toolUseId) => {
		if (input.hook_event_name !== "PreToolUse") return {};
		const toolInput = asRecord(input.tool_input);
		const agent =
			typeof toolInput?.subagent_type === "string"
				? toolInput.subagent_type
				: undefined;
		const limit = agent
			? (policy.limits?.[agent] ?? Number.POSITIVE_INFINITY)
			: 0;
		const used = agent ? (invocations.get(agent) ?? 0) : 0;
		const active = agent ? (activeAgents.get(agent)?.size ?? 0) : 0;
		const concurrentLimit = agent
			? (policy.maxConcurrent?.[agent] ?? Number.POSITIVE_INFINITY)
			: 0;
		const verifierBeforeHunter =
			agent === "verifier" && (invocations.get("hunter") ?? 0) === 0;
		if (
			!agent ||
			used >= limit ||
			active >= concurrentLimit ||
			verifierBeforeHunter
		) {
			return {
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason:
						"This agent invocation exceeds the configured run bound.",
				},
			};
		}
		invocations.set(agent, used + 1);
		if (toolUseId) {
			const activeToolIds = activeAgents.get(agent) ?? new Set<string>();
			activeToolIds.add(toolUseId);
			activeAgents.set(agent, activeToolIds);
			toolAgents.set(toolUseId, agent);
		}
		return {
			hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "allow",
			},
		};
	};
}

function agentCompletionHook(
	activeAgents: Map<string, Set<string>>,
	toolAgents: Map<string, string>,
): HookCallback {
	return async (input) => {
		if (
			input.hook_event_name !== "PostToolUse" &&
			input.hook_event_name !== "PostToolUseFailure"
		) {
			return {};
		}
		const agent = toolAgents.get(input.tool_use_id);
		if (agent) {
			activeAgents.get(agent)?.delete(input.tool_use_id);
			toolAgents.delete(input.tool_use_id);
		}
		return {};
	};
}

function guardTool<S extends AnyZodRawShape>(
	def: SdkMcpToolDefinition<S>,
): SdkMcpToolDefinition<S> {
	return {
		...def,
		handler: async (args, extra) => {
			try {
				return await def.handler(args, extra);
			} catch (error) {
				console.error(`[engine] tool ${def.name} failed`, error);
				return {
					content: [
						{
							type: "text" as const,
							text: `TOOL_ERROR: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	};
}

async function executeQuery(
	context: RunContext,
	prompt: string | AsyncIterable<SDKUserMessage>,
	agents: Record<string, AgentDefinition>,
	maxTurns: number,
	model: "claude-sonnet-5" | "claude-haiku-4-5",
	agentPolicy?: AgentInvocationPolicy,
): Promise<void> {
	const mcpServer = createSdkMcpServer({
		name: "customerzero",
		version: "1.0.0",
		alwaysLoad: true,
		tools: createTools(context).map((def) =>
			guardTool(def as unknown as SdkMcpToolDefinition<AnyZodRawShape>),
		) as unknown as ReturnType<typeof createTools>,
	});
	const allowedMcpTools = [
		"web_search",
		"web_extract",
		"memory_recall",
		"memory_add",
		"enrich_lead",
		"save_lead",
		"emit_event",
		"budget_read",
	].map(mcpTool);
	let failure: string | undefined;
	const agentInvocations = new Map<string, number>();
	const activeAgents = new Map<string, Set<string>>();
	const toolAgents = new Map<string, string>();
	const completionHook = agentCompletionHook(activeAgents, toolAgents);
	const stream = query({
		prompt,
		options: {
			model,
			agents,
			mcpServers: { customerzero: mcpServer },
			tools: ["Agent"],
			allowedTools: ["Agent", ...allowedMcpTools],
			permissionMode: "dontAsk",
			settingSources: [],
			strictMcpConfig: true,
			maxTurns,
			hooks: agentPolicy
				? {
						PreToolUse: [
							{
								matcher: "Agent",
								hooks: [
									agentLimitHook(
										agentPolicy,
										agentInvocations,
										activeAgents,
										toolAgents,
									),
								],
							},
						],
						PostToolUse: [{ matcher: "Agent", hooks: [completionHook] }],
						PostToolUseFailure: [{ matcher: "Agent", hooks: [completionHook] }],
					}
				: undefined,
			persistSession: true,
			forwardSubagentText: true,
			stderr: (data: string) => {
				const text = String(data).trim();
				if (text) console.error("[claude-stderr]", text.slice(0, 600));
			},
			outputFormat: {
				type: "json_schema",
				schema: z.toJSONSchema(CompletionSchema, { target: "draft-7" }),
			},
		},
	});

	try {
		for await (const message of stream) {
			routeSdkMessage(context, message);
			if (message.type === "result" && message.subtype !== "success") {
				failure = message.errors.join("; ") || message.subtype;
			}
		}
	} finally {
		try {
			await stream.close?.();
		} catch {
			// already terminated
		}
	}
	if (failure) throw new Error(failure);
	for (const required of agentPolicy?.required ?? []) {
		if ((agentInvocations.get(required) ?? 0) !== 1) {
			throw new Error(
				`Radar tick did not invoke exactly one ${required} agent`,
			);
		}
	}
}

export async function runOrchestrator(input: OrchestratorInput): Promise<void> {
	const context: RunContext = {
		...input,
		quota: Math.min(input.depth, 10),
		radar: false,
		lastBudgetSpent: -1,
		agentLanes: new Map(),
	};
	resetTavilyBudget(input.runId);
	try {
		await ensureInsForgeTables();
	} catch (error) {
		console.warn(
			"[engine] InsForge schema setup failed",
			error instanceof Error ? error.message : error,
		);
	}
	appendEngineEvent(input.runId, {
		lane: "system",
		type: "stage_change",
		payload: { state: "INTAKE", domain: input.domain },
	});
	emitBudget(context);
	await persistRunState(context);

	let firstAttemptFailed = false;
	let firstAttemptError: unknown;
	try {
		await executeQuery(
			context,
			gatedOrchestrationPrompt(context),
			agentDefinitions,
			250,
			"claude-sonnet-5",
			{ maxConcurrent: { hunter: 4 } },
		);
	} catch (error) {
		firstAttemptFailed = true;
		firstAttemptError = error;
	}

	const firstAttemptRun = getRun(input.runId);
	if (firstAttemptFailed || firstAttemptRun?.state !== "REVIEW") {
		if (!firstAttemptRun?.selectedIcpId) {
			if (firstAttemptFailed) throw firstAttemptError;
			throw new Error(
				"Claude completed before the confirmed-ICP hunt finished",
			);
		}

		const verifiedLeadCount = firstAttemptRun.leads.size;
		const remainingQuota = Math.max(context.quota - verifiedLeadCount, 0);
		const stageCheckpoint = firstAttemptRun.events
			.filter((event) => event.type === "stage_change")
			.map((event) => event.payload);
		appendEngineEvent(input.runId, {
			lane: "system",
			type: "agent_started",
			payload: {
				agent: "system",
				message: "resuming interrupted hunt — attempt 2",
			},
		});
		await executeQuery(
			context,
			`This is a resumed hunt for CustomerZero run ${context.runId}; the previous session was interrupted or ended before clean completion. Continue from where it stopped without repeating INTAKE or ICP_CONFIRM.
Domain: ${context.domain}
Current run state: ${firstAttemptRun.state}
Confirmed ICP id: ${firstAttemptRun.selectedIcpId}
Current verified-lead count: ${verifiedLeadCount}
Remaining quota: ${remainingQuota} of ${context.quota}
Persisted stage checkpoint: ${JSON.stringify(stageCheckpoint)}

Use the Agent tool for specialists and only CustomerZero MCP tools for external actions. If the state is ICP_CONFIRM, create the confirmed ICP's strategy and transition through STRATEGY to HUNTING. If it is STRATEGY, continue with its saved QueryPlan into HUNTING. If it is HUNTING, resume hunter waves and the extractor, memory_recall, verifier, enricher, scorer, composer, and save_lead pipeline. If it is already REVIEW, do not reopen the hunt. Respect the remaining quota and current budget. Emit stage_change REVIEW when the hunt is done, then end with structured status REVIEW and the actual verified lead count.

${eventPayloadReference}`,
			agentDefinitions,
			250,
			"claude-sonnet-5",
			{ maxConcurrent: { hunter: 4 } },
		);
	}
	const completedRun = getRun(input.runId);
	if (completedRun?.state !== "REVIEW") {
		if (completedRun?.state !== "HUNTING" || !completedRun.selectedIcpId) {
			throw new Error(
				"Claude completed before the confirmed-ICP hunt finished",
			);
		}
		appendEngineEvent(input.runId, {
			lane: "system",
			type: "stage_change",
			payload: { state: "REVIEW", domain: input.domain },
		});
	}
	await persistRunState(context);
}

export async function runRadarRound(
	runId: string,
	queryPack: QueryPack,
): Promise<Lead | undefined> {
	const run = getRun(runId);
	if (!run) throw new Error(`Unknown run: ${runId}`);
	const context: RunContext = {
		runId,
		domain: run.domain,
		depth: run.depth,
		quota: 1,
		radar: true,
		lastBudgetSpent: getTavilyBudget(runId).spent,
		agentLanes: new Map(),
	};
	const radarAgents = {
		hunter: agentDefinitions.hunter,
		extractor: agentDefinitions.extractor,
		verifier: agentDefinitions.verifier,
		enricher: agentDefinitions.enricher,
		scorer: agentDefinitions.scorer,
		composer: agentDefinitions.composer,
	};
	await executeQuery(
		context,
		`Run exactly one cached radar round for this query pack: ${JSON.stringify(queryPack)}. Invoke hunter once, then extractor, memory_recall, verifier, enricher, scorer, and composer for at most one new candidate. Call save_lead only after an independent verifier re-fetch. End with structured status RADAR and the accepted lead count.`,
		radarAgents,
		40,
		"claude-sonnet-5",
		{
			limits: {
				hunter: 1,
				extractor: 1,
				verifier: 1,
				enricher: 1,
				scorer: 1,
				composer: 1,
			},
			required: ["hunter", "verifier"],
		},
	);
	appendEngineEvent(runId, {
		lane: "system",
		type: "stage_change",
		payload: { state: "RADAR", domain: run.domain },
	});
	await persistRunState(context);
	return context.acceptedLead;
}
