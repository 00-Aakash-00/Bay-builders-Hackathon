import { createHash } from "node:crypto";
import {
	type CandidateSignal,
	type Channel,
	type ICPHypothesis,
	type Lead,
	LeadSchema,
	type OutreachDraft,
	type ProductBrief,
	type QueryPlan,
	type RunEvent,
	RunEventSchema,
	type ScoreBreakdown,
} from "../schemas";

export interface MockRunScriptInput {
	runId: string;
	domain: string;
	startedAt: string;
}

export type MockRunStep =
	| { kind: "event"; delayMs: number; event: RunEvent }
	| { kind: "pause"; gate: "icp_confirmation" };

type EventInput = RunEvent extends infer Event
	? Event extends RunEvent
		? Omit<Event, "runId" | "seq" | "ts">
		: never
	: never;

type HunterLane =
	| "hunter:reddit"
	| "hunter:hn"
	| "hunter:reviews"
	| "hunter:github"
	| "hunter:jobs";

interface LeadSeed {
	name: string;
	company: string;
	role: string;
	lane: HunterLane;
	channel: Channel;
	url: string;
	title: string;
	authorHandle: string;
	quote: string;
	evidencePhrase: string;
	daysAgo: number;
	sourceType: string;
	score: ScoreBreakdown;
	reachability: {
		kind: "thread_reply" | "public_email" | "public_profile";
		value: string;
		provenanceUrl: string;
		confidence: "high" | "medium" | "low";
	};
	whyFit: string;
	whyNow: string;
	caution?: string;
}

interface RejectedSeed {
	lane: HunterLane;
	channel: Channel;
	url: string;
	title: string;
	authorHandle: string;
	quote: string;
	daysAgo: number;
	reason:
		| "quote not found on re-fetch"
		| "source 404"
		| "signal is 14 months old"
		| "author is a competitor employee";
}

const DELAY_PATTERN = [250, 700, 850, 600, 900, 750, 650, 800] as const;

const LEAD_SEEDS = [
	{
		name: "Maya Chen",
		company: "Northstar Studio",
		role: "Founder",
		lane: "hunter:reddit",
		channel: "reddit",
		url: "https://www.reddit.com/r/SaaS/comments/cz101/founder_prospecting_routine/",
		title: "How are solo founders finding the right early users?",
		authorHandle: "mayabuilds",
		quote:
			"I spend every Friday stitching together Reddit threads just to find five people who might actually need what we built.",
		evidencePhrase: "spend every Friday stitching together Reddit threads",
		daysAgo: 3,
		sourceType: "reddit_thread",
		score: {
			pain: 5,
			fit: 5,
			timing: 5,
			reachability: 4,
			evidenceQuality: 3,
			total: 91,
			stage: "high_intent",
		},
		reachability: {
			kind: "thread_reply",
			value: "Reply to u/mayabuilds in the source thread",
			provenanceUrl:
				"https://www.reddit.com/r/SaaS/comments/cz101/founder_prospecting_routine/",
			confidence: "high",
		},
		whyFit:
			"A solo SaaS founder doing manual signal discovery every week matches the core workflow.",
		whyNow:
			"The post asks for a better process and was published three days ago.",
	},
	{
		name: "Owen Brooks",
		company: "Patchwork Labs",
		role: "Co-founder",
		lane: "hunter:hn",
		channel: "hn",
		url: "https://news.ycombinator.com/item?id=45123001",
		title: "Ask HN: Separating buying signals from launch feedback",
		authorHandle: "owenpatch",
		quote:
			"We launched three weeks ago and still cannot tell which complaints are buying signals versus polite feedback.",
		evidencePhrase: "cannot tell which complaints are buying signals",
		daysAgo: 7,
		sourceType: "hn_comment",
		score: {
			pain: 5,
			fit: 5,
			timing: 4,
			reachability: 4,
			evidenceQuality: 4,
			total: 90,
			stage: "high_intent",
		},
		reachability: {
			kind: "public_profile",
			value: "https://news.ycombinator.com/user?id=owenpatch",
			provenanceUrl: "https://news.ycombinator.com/user?id=owenpatch",
			confidence: "high",
		},
		whyFit:
			"A newly launched small team needs evidence triage before it can repeat founder-led sales.",
		whyNow:
			"The launch is only three weeks old and the founder is actively asking for a solution.",
	},
	{
		name: "Priya Raman",
		company: "Foldwise",
		role: "CEO",
		lane: "hunter:reviews",
		channel: "reviews",
		url: "https://www.g2.com/products/nearestcompetitor/reviews/foldwise-2026",
		title: "NearestCompetitor review from Foldwise",
		authorHandle: "priya-r",
		quote:
			"I wish this surfaced the actual person behind each pain point instead of giving me another anonymous trend chart.",
		evidencePhrase: "the actual person behind each pain point",
		daysAgo: 9,
		sourceType: "g2_review",
		score: {
			pain: 4,
			fit: 5,
			timing: 5,
			reachability: 4,
			evidenceQuality: 4,
			total: 89,
			stage: "high_intent",
		},
		reachability: {
			kind: "public_email",
			value: "hello@foldwise.example",
			provenanceUrl: "https://foldwise.example/contact",
			confidence: "medium",
		},
		whyFit:
			"The reviewer explicitly wants person-level evidence rather than aggregate market data.",
		whyNow:
			"A recent competitor review shows active evaluation and switching intent.",
	},
	{
		name: "Mateo Silva",
		company: "Dockline",
		role: "Technical co-founder",
		lane: "hunter:github",
		channel: "github",
		url: "https://github.com/docklinehq/roadmap/issues/47",
		title: "Automate feature-request research without a research ops stack",
		authorHandle: "mateosilva-dev",
		quote:
			"We keep tagging feature requests by hand because our tiny team cannot afford a full research ops stack.",
		evidencePhrase: "tagging feature requests by hand",
		daysAgo: 14,
		sourceType: "github_issue",
		score: {
			pain: 5,
			fit: 4,
			timing: 4,
			reachability: 5,
			evidenceQuality: 3,
			total: 85,
			stage: "problem_aware",
		},
		reachability: {
			kind: "thread_reply",
			value: "Reply to @mateosilva-dev on issue #47",
			provenanceUrl: "https://github.com/docklinehq/roadmap/issues/47",
			confidence: "high",
		},
		whyFit:
			"The team is manually processing public customer evidence with the exact lightweight constraint.",
		whyNow:
			"The issue is open, recently active, and framed as a current operational burden.",
	},
	{
		name: "Lena Ortiz",
		company: "Sprigboard",
		role: "Founder",
		lane: "hunter:jobs",
		channel: "jobs",
		url: "https://jobs.sprigboard.example/growth-generalist",
		title: "First growth generalist at Sprigboard",
		authorHandle: "lena-sprigboard",
		quote:
			"I am hiring our first growth generalist because founder-led prospecting has stopped scaling.",
		evidencePhrase: "founder-led prospecting has stopped scaling",
		daysAgo: 18,
		sourceType: "job_post",
		score: {
			pain: 4,
			fit: 4,
			timing: 5,
			reachability: 4,
			evidenceQuality: 4,
			total: 84,
			stage: "trigger_present",
		},
		reachability: {
			kind: "public_profile",
			value: "https://www.linkedin.com/in/lena-ortiz-sprigboard",
			provenanceUrl: "https://sprigboard.example/about",
			confidence: "medium",
		},
		whyFit:
			"A small founder-led team is at the point where manual prospecting no longer works.",
		whyNow:
			"The first growth hire is a concrete budget and workflow-change trigger.",
	},
	{
		name: "Jules Martin",
		company: "QuietLayer",
		role: "Founder",
		lane: "hunter:reddit",
		channel: "reddit",
		url: "https://www.reddit.com/r/startups/comments/cz106/verifying_customer_pain/",
		title: "Finding conversations is easy; verifying them is not",
		authorHandle: "julesquiet",
		quote:
			"I can find conversations about the problem, but verifying the quote and finding a respectful way to reply takes hours.",
		evidencePhrase:
			"verifying the quote and finding a respectful way to reply takes hours",
		daysAgo: 24,
		sourceType: "reddit_thread",
		score: {
			pain: 5,
			fit: 4,
			timing: 3,
			reachability: 4,
			evidenceQuality: 4,
			total: 81,
			stage: "problem_aware",
		},
		reachability: {
			kind: "thread_reply",
			value: "Reply to u/julesquiet in the source thread",
			provenanceUrl:
				"https://www.reddit.com/r/startups/comments/cz106/verifying_customer_pain/",
			confidence: "high",
		},
		whyFit:
			"The founder values both evidence verification and a natural public outreach channel.",
		whyNow:
			"They are already attempting the workflow manually and quantifying the time cost.",
	},
	{
		name: "Sana Iqbal",
		company: "BranchKit",
		role: "Co-founder",
		lane: "hunter:hn",
		channel: "hn",
		url: "https://news.ycombinator.com/item?id=45123777",
		title: "Ask HN: Qualifying a growing waitlist",
		authorHandle: "sanabranch",
		quote:
			"Our waitlist is growing, but I have no evidence which teams feel the pain urgently enough to pay now.",
		evidencePhrase:
			"no evidence which teams feel the pain urgently enough to pay",
		daysAgo: 31,
		sourceType: "hn_comment",
		score: {
			pain: 4,
			fit: 4,
			timing: 4,
			reachability: 3,
			evidenceQuality: 4,
			total: 77,
			stage: "problem_aware",
		},
		reachability: {
			kind: "public_email",
			value: "founders@branchkit.example",
			provenanceUrl: "https://branchkit.example/contact",
			confidence: "medium",
		},
		whyFit:
			"The team needs evidence-based prioritization among early potential buyers.",
		whyNow:
			"A growing waitlist has created an immediate qualification decision.",
	},
	{
		name: "Theo Park",
		company: "MetricNest",
		role: "Founder",
		lane: "hunter:reviews",
		channel: "reviews",
		url: "https://www.g2.com/products/nearestcompetitor/reviews/metricnest-2026",
		title: "MetricNest switches away from NearestCompetitor",
		authorHandle: "theo-metricnest",
		quote:
			"I canceled NearestCompetitor because it found accounts, not the exact moment someone asked for help.",
		evidencePhrase:
			"found accounts, not the exact moment someone asked for help",
		daysAgo: 38,
		sourceType: "g2_review",
		score: {
			pain: 4,
			fit: 4,
			timing: 3,
			reachability: 4,
			evidenceQuality: 3,
			total: 73,
			stage: "high_intent",
		},
		reachability: {
			kind: "public_profile",
			value: "https://metricnest.example/about#theo",
			provenanceUrl: "https://metricnest.example/about",
			confidence: "medium",
		},
		whyFit:
			"The buyer explicitly rejects account lists in favor of timely, person-level signals.",
		whyNow: "A recent cancellation creates an active replacement window.",
		caution:
			"Confirm that the competitor cancellation did not pause all prospecting spend.",
	},
	{
		name: "Amara Wilson",
		company: "Loomfield",
		role: "Product lead",
		lane: "hunter:github",
		channel: "github",
		url: "https://github.com/loomfieldhq/community/issues/112",
		title: "Turn issue conversations into respectful customer interviews",
		authorHandle: "amaraw",
		quote:
			"We need a lightweight way to turn issue threads into qualified interviews without spamming maintainers.",
		evidencePhrase:
			"turn issue threads into qualified interviews without spamming maintainers",
		daysAgo: 47,
		sourceType: "github_issue",
		score: {
			pain: 4,
			fit: 3,
			timing: 4,
			reachability: 3,
			evidenceQuality: 3,
			total: 69,
			stage: "problem_aware",
		},
		reachability: {
			kind: "thread_reply",
			value: "Reply to @amaraw on issue #112",
			provenanceUrl: "https://github.com/loomfieldhq/community/issues/112",
			confidence: "high",
		},
		whyFit:
			"The team wants a lightweight, evidence-led path from public threads to interviews.",
		whyNow: "The open issue shows the workflow is being designed right now.",
	},
	{
		name: "Eli Novak",
		company: "TinyRelay",
		role: "Founder",
		lane: "hunter:jobs",
		channel: "jobs",
		url: "https://jobs.tinyrelay.example/customer-research-contractor",
		title: "Customer research contractor for TinyRelay",
		authorHandle: "eli-tinyrelay",
		quote:
			"I am looking for a contractor who can find ten qualified founder interviews without buying another stale lead list.",
		evidencePhrase:
			"ten qualified founder interviews without buying another stale lead list",
		daysAgo: 57,
		sourceType: "job_post",
		score: {
			pain: 3,
			fit: 3,
			timing: 3,
			reachability: 4,
			evidenceQuality: 4,
			total: 66,
			stage: "trigger_present",
		},
		reachability: {
			kind: "public_email",
			value: "eli@tinyrelay.example",
			provenanceUrl: "https://tinyrelay.example/contact",
			confidence: "medium",
		},
		whyFit:
			"The founder wants a small, qualified set rather than a generic account database.",
		whyNow:
			"The active contractor post indicates approved effort and a near-term interview quota.",
		caution: "The post is nearing the sixty-day recency boundary.",
	},
] as const satisfies readonly LeadSeed[];

const REJECTED_SEEDS = [
	{
		lane: "hunter:reddit",
		channel: "reddit",
		url: "https://www.reddit.com/r/Entrepreneur/comments/cz201/prospecting_quote/",
		title: "Founder prospecting discussion",
		authorHandle: "bootstrap-dawn",
		quote: "I lose two days a week looking for buyers in public threads.",
		daysAgo: 5,
		reason: "quote not found on re-fetch",
	},
	{
		lane: "hunter:github",
		channel: "github",
		url: "https://github.com/microstack-labs/feedback/issues/19",
		title: "Customer discovery automation request",
		authorHandle: "microstack-alex",
		quote: "We need this before our next launch cycle.",
		daysAgo: 4,
		reason: "source 404",
	},
	{
		lane: "hunter:hn",
		channel: "hn",
		url: "https://news.ycombinator.com/item?id=39812002",
		title: "Ask HN: Manual customer discovery",
		authorHandle: "oldsignal",
		quote: "I am still collecting every prospect by hand.",
		daysAgo: 420,
		reason: "signal is 14 months old",
	},
	{
		lane: "hunter:reviews",
		channel: "reviews",
		url: "https://www.g2.com/products/nearestcompetitor/reviews/internal-testimonial",
		title: "NearestCompetitor product review",
		authorHandle: "nc-growth-team",
		quote: "I replaced four separate prospecting tools with this workflow.",
		daysAgo: 12,
		reason: "author is a competitor employee",
	},
] as const satisfies readonly RejectedSeed[];

const SIGNAL_ORDER = [
	{ kind: "lead", index: 0 },
	{ kind: "lead", index: 1 },
	{ kind: "reject", index: 0 },
	{ kind: "lead", index: 2 },
	{ kind: "lead", index: 3 },
	{ kind: "reject", index: 1 },
	{ kind: "lead", index: 4 },
	{ kind: "lead", index: 5 },
	{ kind: "reject", index: 2 },
	{ kind: "lead", index: 6 },
	{ kind: "lead", index: 7 },
	{ kind: "reject", index: 3 },
	{ kind: "lead", index: 8 },
	{ kind: "lead", index: 9 },
] as const;

function referenceTime(startedAt: string): number {
	const value = Date.parse(startedAt);
	if (!Number.isFinite(value)) {
		throw new TypeError("startedAt must be an ISO date-time");
	}
	return value;
}

function isoBefore(referenceMs: number, milliseconds: number): string {
	return new Date(referenceMs - milliseconds).toISOString();
}

function signalHash(url: string, authorHandle: string): string {
	const normalizedUrl = new URL(url);
	normalizedUrl.hash = "";
	normalizedUrl.hostname = normalizedUrl.hostname.toLowerCase();
	normalizedUrl.searchParams.sort();
	const normalized = normalizedUrl.toString().replace(/\/$/u, "");
	return createHash("sha256")
		.update(`${normalized}${authorHandle}`)
		.digest("hex");
}

function domainLabel(domain: string): string {
	return domain
		.trim()
		.replace(/^https?:\/\//u, "")
		.replace(/^www\./u, "")
		.split("/")[0];
}

function brandName(domain: string): string {
	const label = domainLabel(domain);
	const parts = label.split(".");
	const root = parts.length > 1 ? parts.at(-2) : parts[0];
	return (root || "Your product")
		.split(/[-_]/u)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function makeBrief(domain: string, brand: string): ProductBrief {
	return {
		domain,
		product: `${brand} is a lightweight customer-discovery workspace for indie founders and small product teams.`,
		outcome:
			"Turns public pain conversations into a short list of verified people worth contacting.",
		buyer: "Indie founders and small B2B SaaS teams",
		user: "A founder or first growth hire doing founder-led sales",
		priceMotion: "Self-serve monthly subscription with a team upgrade",
		geography: "English-speaking remote-first markets",
		topUseCase:
			"Finding ten evidence-backed early customers without buying a stale lead list",
		inferences: [
			"The submitted domain is treated as a B2B SaaS product for this deterministic demo.",
			"The strongest initial wedge is a team with no dedicated research or sales-ops function.",
		],
	};
}

function makeIcps(runId: string): ICPHypothesis[] {
	return [
		{
			id: `${runId}-icp-1`,
			persona: "Bootstrapped B2B SaaS founder",
			industry: "B2B software",
			companySize: "1–10 people",
			painTriggers: [
				"Manually searching public communities for prospects",
				"Unclear which feedback signals willingness to pay",
				"Founder-led prospecting no longer fits into the week",
			],
			positiveSignals: [
				"Recent launch or first growth hire",
				"Asking for customer-discovery tools or workflows",
				"Switching away from generic lead databases",
			],
			disqualifiers: [
				"Established outbound team with mature sales operations",
				"No public evidence of an active customer-discovery problem",
			],
			vocabulary: [
				"founder-led sales",
				"early users",
				"qualified interviews",
				"buying signal",
			],
		},
		{
			id: `${runId}-icp-2`,
			persona: "First growth or product hire",
			industry: "Developer tools and vertical SaaS",
			companySize: "5–25 people",
			painTriggers: [
				"Scattered feedback across issues, reviews, and community threads",
				"Too little evidence to prioritize outreach",
				"Pressure to create a repeatable research pipeline",
			],
			positiveSignals: [
				"Open role for growth or customer research",
				"Public request to automate evidence collection",
				"Small team discussing research-ops alternatives",
			],
			disqualifiers: [
				"Enterprise procurement requirement",
				"Request is only for anonymous aggregate analytics",
			],
			vocabulary: [
				"research ops",
				"voice of customer",
				"feature requests",
				"why now",
			],
		},
	];
}

function makeQueryPlan(runId: string, brand: string): QueryPlan {
	return {
		icpId: `${runId}-icp-1`,
		packs: [
			{
				bucket: "demand",
				channel: "reddit",
				provider: "tavily",
				queries: [
					`"find early users" founder SaaS`,
					`"customer discovery tool" indie founder ${brand}`,
				],
			},
			{
				bucket: "pain",
				channel: "hn",
				provider: "youcom",
				queries: ["site:news.ycombinator.com prospecting takes hours founder"],
			},
			{
				bucket: "workaround",
				channel: "github",
				provider: "nimble",
				queries: ["github issue manual feature request research small team"],
			},
			{
				bucket: "switching",
				channel: "reviews",
				provider: "tavily",
				queries: ["NearestCompetitor review accounts not intent"],
			},
			{
				bucket: "timing",
				channel: "jobs",
				provider: "nimble",
				queries: ["startup first growth hire customer research prospecting"],
			},
		],
		budget: {
			providers: [
				{ provider: "tavily", allocated: 18 },
				{ provider: "youcom", allocated: 14 },
				{ provider: "nimble", allocated: 18 },
			],
		},
	};
}

function candidateFromLead(
	seed: LeadSeed,
	referenceMs: number,
): CandidateSignal {
	return {
		url: seed.url,
		channel: seed.channel,
		title: seed.title,
		authorHandle: seed.authorHandle,
		quoteCandidate: seed.quote,
		publishedAt: isoBefore(referenceMs, seed.daysAgo * 24 * 60 * 60 * 1000),
		foundBy: seed.lane,
	};
}

function candidateFromRejected(
	seed: RejectedSeed,
	referenceMs: number,
): CandidateSignal {
	return {
		url: seed.url,
		channel: seed.channel,
		title: seed.title,
		authorHandle: seed.authorHandle,
		quoteCandidate: seed.quote,
		publishedAt: isoBefore(referenceMs, seed.daysAgo * 24 * 60 * 60 * 1000),
		foundBy: seed.lane,
	};
}

function leadFromSeed(
	seed: LeadSeed,
	index: number,
	input: MockRunScriptInput,
	referenceMs: number,
): Lead {
	return LeadSchema.parse({
		id: `${input.runId}-lead-${index + 1}`,
		runId: input.runId,
		name: seed.name,
		type: "person",
		signal: {
			url: seed.url,
			channel: seed.channel,
			quote: seed.quote,
			authorHandle: seed.authorHandle,
			authorDisplay: seed.name,
			company: seed.company,
			publishedAt: isoBefore(referenceMs, seed.daysAgo * 24 * 60 * 60 * 1000),
			sourceType: seed.sourceType,
			hash: signalHash(seed.url, seed.authorHandle),
		},
		score: seed.score,
		enrichment: {
			company: seed.company,
			role: seed.role,
			companyContext: `${seed.company} is a fictional small B2B software team in the demo fixture.`,
			channel: {
				kind: seed.reachability.kind,
				value: seed.reachability.value,
				provenanceUrl: seed.reachability.provenanceUrl,
			},
			reachabilityConfidence: seed.reachability.confidence,
		},
		whyFit: seed.whyFit,
		whyNow: seed.whyNow,
		...(seed.caution ? { caution: seed.caution } : {}),
	});
}

function draftForLead(
	seed: LeadSeed,
	lead: Lead,
	brand: string,
): OutreachDraft {
	const firstName = seed.name.split(" ")[0];
	return {
		leadId: lead.id,
		channel: seed.reachability.kind,
		...(seed.reachability.kind === "public_email"
			? { subject: `A question about ${seed.company}'s customer discovery` }
			: {}),
		body: `${firstName} — your note that “${seed.evidencePhrase}” stood out. ${brand} turns public pain conversations into verified, quote-backed prospects for lean teams. Would a short look at how it separates buying signals from noise be useful?`,
		groundedIn: [seed.url],
	};
}

function searchTool(lane: HunterLane): string {
	switch (lane) {
		case "hunter:hn":
			return "youcom_search";
		case "hunter:github":
		case "hunter:jobs":
			return "nimble_serp";
		default:
			return "tavily_search";
	}
}

export function createMockRunScript(input: MockRunScriptInput): MockRunStep[] {
	const startedAtMs = referenceTime(input.startedAt);
	const brand = brandName(input.domain);
	const brief = makeBrief(input.domain, brand);
	const icps = makeIcps(input.runId);
	const queryPlan = makeQueryPlan(input.runId, brand);
	const steps: MockRunStep[] = [];
	let elapsedMs = 0;
	let seq = 0;

	function add(event: EventInput): void {
		const delayMs = DELAY_PATTERN[seq % DELAY_PATTERN.length];
		elapsedMs += delayMs;
		seq += 1;
		const parsed = RunEventSchema.parse({
			...event,
			runId: input.runId,
			seq,
			ts: new Date(startedAtMs + elapsedMs).toISOString(),
		});
		steps.push({ kind: "event", delayMs, event: parsed });
	}

	add({
		lane: "system",
		type: "stage_change",
		payload: { state: "INTAKE", domain: input.domain },
	});
	add({
		lane: "system",
		type: "agent_started",
		payload: {
			agent: "intake-analyst",
			message: `Reading ${domainLabel(input.domain)}`,
		},
	});
	add({
		lane: "system",
		type: "tool_call",
		payload: {
			tool: "nimble_extract",
			action: `Extracting product copy from ${input.domain}`,
		},
	});
	add({
		lane: "system",
		type: "tool_call",
		payload: {
			tool: "tavily_search",
			action: `Checking public context for ${brand}`,
		},
	});
	add({
		lane: "system",
		type: "stage_change",
		payload: { state: "INTAKE", domain: input.domain, brief },
	});
	add({
		lane: "system",
		type: "agent_started",
		payload: {
			agent: "icp-architect",
			message: "Drafting two testable ICP hypotheses",
		},
	});
	add({
		lane: "system",
		type: "stage_change",
		payload: { state: "ICP_CONFIRM", domain: input.domain, brief, icps },
	});

	steps.push({ kind: "pause", gate: "icp_confirmation" });

	add({
		lane: "system",
		type: "stage_change",
		payload: { state: "STRATEGY", domain: input.domain, queryPlan },
	});
	add({
		lane: "system",
		type: "agent_started",
		payload: {
			agent: "hunt-strategist",
			message: "Expanding the confirmed ICP into five signal buckets",
		},
	});
	add({
		lane: "system",
		type: "tool_call",
		payload: {
			tool: "budget_read",
			action: "Allocating $50 across three search providers",
		},
	});
	add({
		lane: "system",
		type: "tool_call",
		payload: {
			tool: "hydra_recall",
			action: "Checking prior signal vocabulary and duplicates",
		},
	});
	add({
		lane: "system",
		type: "stage_change",
		payload: { state: "HUNTING", domain: input.domain, queryPlan },
	});

	for (const [lane, message] of [
		["hunter:reddit", "Searching first-person founder pain on Reddit"],
		["hunter:hn", "Searching launch and customer-discovery threads on HN"],
		["hunter:reviews", "Mining recent NearestCompetitor reviews"],
		["hunter:github", "Scanning issue threads for manual research workarounds"],
		["hunter:jobs", "Scanning hiring triggers at small software teams"],
		["verifier", "Re-fetching every candidate with a default-reject posture"],
		["scorer", "Applying the 100-point evidence rubric"],
		["composer", "Preparing quote-grounded outreach under 90 words"],
	] as const) {
		add({ lane, type: "agent_started", payload: { agent: lane, message } });
	}

	let acceptedIndex = 0;
	for (const [signalIndex, signalRef] of SIGNAL_ORDER.entries()) {
		const seed =
			signalRef.kind === "lead"
				? LEAD_SEEDS[signalRef.index]
				: REJECTED_SEEDS[signalRef.index];
		const candidate =
			signalRef.kind === "lead"
				? candidateFromLead(LEAD_SEEDS[signalRef.index], startedAtMs)
				: candidateFromRejected(REJECTED_SEEDS[signalRef.index], startedAtMs);

		add({
			lane: seed.lane,
			type: "tool_call",
			payload: {
				tool: searchTool(seed.lane),
				action: `Running ${seed.channel} query ${signalIndex + 1}: ${seed.title}`,
			},
		});
		add({ lane: seed.lane, type: "signal_found", payload: candidate });
		add({
			lane: "verifier",
			type: "tool_call",
			payload: {
				tool: "tavily_extract",
				action: `Re-fetching and quote-matching ${seed.url}`,
			},
		});

		if (signalRef.kind === "reject") {
			const rejectedSeed = REJECTED_SEEDS[signalRef.index];
			add({
				lane: "verifier",
				type: "signal_rejected",
				payload: { signal: candidate, reason: rejectedSeed.reason },
			});
		} else {
			const leadSeed = LEAD_SEEDS[signalRef.index];
			const lead = leadFromSeed(leadSeed, signalRef.index, input, startedAtMs);
			const draft = draftForLead(leadSeed, lead, brand);
			acceptedIndex += 1;

			add({ lane: "verifier", type: "lead_verified", payload: lead });
			add({
				lane: "scorer",
				type: "tool_call",
				payload: {
					tool: "score_rubric",
					action: `Scoring ${lead.name}'s verified evidence`,
				},
			});
			add({
				lane: "scorer",
				type: "lead_scored",
				payload: { leadId: lead.id, score: lead.score },
			});
			add({
				lane: "composer",
				type: "tool_call",
				payload: {
					tool: "compose_draft",
					action: `Grounding outreach in ${lead.signal.url}`,
				},
			});
			add({
				lane: "composer",
				type: "draft_ready",
				payload: { draft, status: "draft" },
			});
		}

		if (signalIndex === 5) {
			add({
				lane: "system",
				type: "strategy_pivot",
				payload: {
					rationale:
						"reddit lane dry after 9 queries → pivoting to G2 reviews of NearestCompetitor",
				},
			});
		}

		const budgetBySignal = new Map([
			[1, { spent: 4, provider: "tavily" as const }],
			[3, { spent: 11, provider: "youcom" as const }],
			[5, { spent: 20, provider: "nimble" as const }],
			[8, { spent: 29, provider: "tavily" as const }],
			[10, { spent: 38, provider: "youcom" as const }],
			[13, { spent: 46, provider: "nimble" as const }],
		]);
		const budget = budgetBySignal.get(signalIndex);
		if (budget) {
			add({
				lane: "system",
				type: "budget_update",
				payload: { spent: budget.spent, total: 50, provider: budget.provider },
			});
		}
	}

	add({
		lane: "system",
		type: "stage_change",
		payload: { state: "REVIEW", domain: input.domain },
	});

	if (acceptedIndex !== 10) {
		throw new Error("Mock script must produce exactly ten verified leads");
	}

	return steps;
}

export function createRadarLead(input: MockRunScriptInput): Lead {
	const referenceMs = referenceTime(input.startedAt);
	return LeadSchema.parse({
		id: `${input.runId}-lead-11`,
		runId: input.runId,
		name: "Nora Kim",
		type: "person",
		signal: {
			url: "https://www.reddit.com/r/SaaS/comments/cz301/qualifying_beta_users/",
			channel: "reddit",
			quote:
				"I posted our beta today and already need a better way to tell curious signups from teams with an urgent problem.",
			authorHandle: "norabuildsupdraft",
			authorDisplay: "Nora Kim",
			company: "Updraft Works",
			publishedAt: isoBefore(referenceMs, 2 * 60 * 60 * 1000),
			sourceType: "reddit_thread",
			hash: signalHash(
				"https://www.reddit.com/r/SaaS/comments/cz301/qualifying_beta_users/",
				"norabuildsupdraft",
			),
		},
		score: {
			pain: 4,
			fit: 5,
			timing: 5,
			reachability: 4,
			evidenceQuality: 4,
			total: 89,
			stage: "high_intent",
		},
		enrichment: {
			company: "Updraft Works",
			role: "Founder",
			companyContext:
				"Updraft Works is a fictional two-person B2B SaaS team opening its beta.",
			channel: {
				kind: "thread_reply",
				value: "Reply to u/norabuildsupdraft in the source thread",
				provenanceUrl:
					"https://www.reddit.com/r/SaaS/comments/cz301/qualifying_beta_users/",
			},
			reachabilityConfidence: "high",
		},
		whyFit: `${brandName(input.domain)} is designed for a tiny team separating urgent public pain from casual interest.`,
		whyNow: "Posted two hours ago, on the same day the team opened its beta.",
	});
}
