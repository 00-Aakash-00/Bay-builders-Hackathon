import { fetchRealBrief } from "@/lib/engine/intake";
import { createMockRunScript, createRadarLead } from "@/lib/mock/run-script";
import {
	type ICPHypothesis,
	type Lead,
	LeadSchema,
	type OutreachDraft,
	OutreachDraftSchema,
	type ProductBrief,
	type RunEvent,
	RunEventSchema,
	type RunState,
	RunStateSchema,
} from "@/lib/schemas";

export type RunDepth = 5 | 10 | 20;

export type StoredDraft = OutreachDraft & {
	status: "draft" | "sent";
};

export interface RunRecord {
	id: string;
	domain: string;
	depth: RunDepth;
	state: RunState;
	mode: "live" | "demo";
	createdAt: string;
	events: RunEvent[];
	budget: {
		spent: number;
		total: number;
	};
	leads: Map<string, Lead>;
	drafts: Map<string, StoredDraft>;
	selectedIcpId?: string;
}

export type RunListSnapshot = Pick<
	RunRecord,
	"id" | "domain" | "depth" | "state" | "mode" | "createdAt" | "budget"
> & {
	leadCount: number;
};

type Subscriber = (event: RunEvent) => void;

interface IcpGate {
	promise: Promise<void>;
	resolve: () => void;
	resolved: boolean;
}

interface StoredRun extends RunRecord {
	subscribers: Set<Subscriber>;
	icpGate: IcpGate;
	radarLead?: Lead;
	radarRunner?: () => Promise<Lead | undefined>;
}

const globalForRunStore = globalThis as typeof globalThis & {
	customerZeroRuns?: Map<string, StoredRun>;
};

const runs = globalForRunStore.customerZeroRuns ?? new Map<string, StoredRun>();
globalForRunStore.customerZeroRuns = runs;

function createIcpGate(): IcpGate {
	let resume = () => {};
	const promise = new Promise<void>((resolve) => {
		resume = resolve;
	});

	return {
		promise,
		resolve: resume,
		resolved: false,
	};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}

	return value as Record<string, unknown>;
}

function nextSequence(run: RunRecord): number {
	return (run.events.at(-1)?.seq ?? 0) + 1;
}

function applyEvent(run: StoredRun, event: RunEvent): void {
	const payload = asRecord(event.payload);

	if (event.type === "stage_change" && payload) {
		const state = RunStateSchema.safeParse(payload.state);
		if (state.success) {
			run.state = state.data;
		}
	}

	if (event.type === "budget_update" && payload) {
		if (typeof payload.spent === "number") {
			run.budget.spent = payload.spent;
		}
		if (typeof payload.total === "number") {
			run.budget.total = payload.total;
		}
	}

	if (event.type === "lead_verified" || event.type === "radar_alert") {
		const lead = LeadSchema.safeParse(event.payload);
		if (lead.success) {
			run.leads.set(lead.data.id, lead.data);
		}
	}

	if (event.type === "draft_ready" && payload) {
		const draft = OutreachDraftSchema.safeParse(payload.draft);
		const status = payload.status;
		if (draft.success && (status === "draft" || status === "sent")) {
			run.drafts.set(draft.data.leadId, { ...draft.data, status });
		}
	}
}

export function append(runId: string, event: RunEvent): RunEvent {
	const run = runs.get(runId);
	if (!run) {
		throw new Error(`Unknown run: ${runId}`);
	}
	if (event.runId !== runId) {
		throw new Error(`Event runId ${event.runId} does not match ${runId}`);
	}

	const parsed = RunEventSchema.parse({
		...event,
		seq: nextSequence(run),
	});

	run.events.push(parsed);
	applyEvent(run, parsed);
	for (const subscriber of run.subscribers) {
		subscriber(parsed);
	}

	return parsed;
}

export function get(runId: string): RunRecord | undefined {
	return runs.get(runId);
}

export const getRun = get;

export function listRuns(): RunListSnapshot[] {
	return Array.from(runs.values(), (run) => ({
		id: run.id,
		domain: run.domain,
		depth: run.depth,
		state: run.state,
		mode: run.mode,
		createdAt: run.createdAt,
		budget: run.budget,
		leadCount: run.leads.size,
	})).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function subscribe(
	runId: string,
	fromSeq: number,
	push: Subscriber,
): () => void {
	const run = runs.get(runId);
	if (!run) {
		throw new Error(`Unknown run: ${runId}`);
	}

	for (const event of run.events) {
		if (event.seq > fromSeq) {
			push(event);
		}
	}
	run.subscribers.add(push);

	return () => {
		run.subscribers.delete(push);
	};
}

function stated(value: string): boolean {
	return !/not stated on site/iu.test(value);
}

function briefSeeds(brief: ProductBrief): {
	personas: [string, string];
	industry: string;
	vocabulary: string[];
} {
	const text = [brief.product, brief.buyer, brief.user, brief.topUseCase].join(
		" ",
	);
	let personas: [string, string];
	let industry = "Industry not stated on site";
	if (/\b(?:venture capital|VC|funds?|LPs?)\b/iu.test(text)) {
		personas = ["VC fund partners", "VC fund operations teams"];
		industry = "Venture capital";
	} else if (
		/\b(?:developer|engineering|agent traces?|models?|repository|repo)\b/iu.test(
			text,
		)
	) {
		personas = [
			"AI agent developers",
			"Engineering teams managing model costs",
		];
		industry = "AI and developer tools";
	} else if (/\bfounders?\b/iu.test(text)) {
		personas = ["Founders", "Founder-led growth teams"];
		industry = /\b(?:SaaS|software)\b/iu.test(text) ? "B2B software" : industry;
	} else {
		const audiences = [brief.user, brief.buyer].filter(stated);
		personas = [
			audiences[0] ?? "Audience not stated on site",
			audiences[1] ?? audiences[0] ?? "Audience not stated on site",
		];
	}

	const patterns = [
		/\bventure capital\b/iu,
		/\bVC funds?\b/iu,
		/\bfund partners?\b/iu,
		/\bLP reports?\b/iu,
		/\bagent traces?\b/iu,
		/\bcheaper models?\b/iu,
		/\bmodel costs?\b/iu,
		/\bevidence\b/iu,
		/\bindie founders?\b/iu,
		/\bfounder-led\b/iu,
	];
	const vocabulary = patterns.flatMap((pattern) => text.match(pattern) ?? []);
	for (const word of text.match(/[A-Za-z][A-Za-z-]{4,}/gu) ?? []) {
		const normalized = word.toLocaleLowerCase("en-US");
		if (
			!["stated", "their", "which", "with", "your"].includes(normalized) &&
			!vocabulary.some(
				(value) => value.toLocaleLowerCase("en-US") === normalized,
			)
		) {
			vocabulary.push(word);
		}
		if (vocabulary.length === 4) break;
	}
	const fallback = [
		brief.buyer,
		brief.user,
		brief.outcome,
		brief.topUseCase,
		brief.product,
		brief.domain,
	].filter(stated);
	while (vocabulary.length < 4) {
		vocabulary.push(
			fallback[vocabulary.length % fallback.length] ?? brief.product,
		);
	}
	return { personas, industry, vocabulary: vocabulary.slice(0, 4) };
}

function briefIcps(
	brief: ProductBrief,
	fixtureIcps: ICPHypothesis[],
): ICPHypothesis[] {
	const seeds = briefSeeds(brief);
	const useCase = stated(brief.topUseCase) ? brief.topUseCase : brief.product;
	const outcome = stated(brief.outcome) ? brief.outcome : brief.product;
	return fixtureIcps.map((icp, index) => ({
		...icp,
		persona: seeds.personas[index] ?? seeds.personas[0],
		industry: seeds.industry,
		painTriggers: [
			`Needs the workflow described by: ${brief.product}`,
			`Still handles “${useCase}” manually`,
			"Uses fragmented tools for the product's core job",
		],
		positiveSignals: [
			`Publicly seeking a solution matching: ${brief.product}`,
			`Actively replacing tools used for “${useCase}”`,
			`Owns the outcome: ${outcome}`,
		],
		vocabulary:
			index === 0
				? seeds.vocabulary
				: [...seeds.vocabulary.slice(1), seeds.vocabulary[0]],
	}));
}

function withRealBrief(event: RunEvent, brief: ProductBrief): RunEvent {
	if (event.type !== "stage_change" || !event.payload.brief) return event;
	return RunEventSchema.parse({
		...event,
		payload: {
			...event.payload,
			brief,
			...(event.payload.icps
				? { icps: briefIcps(brief, event.payload.icps) }
				: {}),
		},
	});
}

export async function driveMockRun(runId: string): Promise<void> {
	const run = runs.get(runId);
	if (!run) {
		throw new Error(`Unknown run: ${runId}`);
	}
	run.mode = "demo";
	const briefingStartedAt = Date.now();
	let realBrief: ProductBrief | undefined;
	try {
		realBrief = await fetchRealBrief(run.domain);
	} catch {
		realBrief = undefined;
	}
	const steps = createMockRunScript({
		runId: run.id,
		domain: run.domain,
		startedAt: run.createdAt,
	});
	let fetchFailureReported = false;
	let firstEvent = true;

	for (const step of steps) {
		if (step.kind === "pause") {
			await run.icpGate.promise;
			continue;
		}

		const delayMs = firstEvent
			? Math.max(0, step.delayMs - (Date.now() - briefingStartedAt))
			: step.delayMs;
		await new Promise((resolve) => setTimeout(resolve, delayMs));
		firstEvent = false;
		const event = realBrief ? withRealBrief(step.event, realBrief) : step.event;
		append(run.id, event);
		if (
			!realBrief &&
			!fetchFailureReported &&
			event.type === "stage_change" &&
			event.payload.state === "INTAKE"
		) {
			fetchFailureReported = true;
			append(run.id, {
				runId: run.id,
				ts: new Date().toISOString(),
				seq: nextSequence(run),
				lane: "system",
				type: "agent_started",
				payload: {
					agent: "intake-analyst",
					message: "site fetch failed — using demo brief",
				},
			});
		}
	}
}

function createStoredRun(
	domain: string,
	depth: RunDepth,
	mode: "live" | "demo",
): StoredRun {
	const id = crypto.randomUUID();
	const createdAt = new Date().toISOString();
	const run: StoredRun = {
		id,
		domain,
		depth,
		state: "INTAKE",
		mode,
		createdAt,
		events: [],
		budget: { spent: 0, total: 50 },
		leads: new Map(),
		drafts: new Map(),
		subscribers: new Set(),
		icpGate: createIcpGate(),
	};

	runs.set(id, run);
	return run;
}

export function createEngineRun(
	domain: string,
	depth: RunDepth = 10,
): RunRecord {
	return createStoredRun(domain, depth, "live");
}

export function createRun(domain: string, depth: RunDepth = 10): RunRecord {
	const run = createStoredRun(domain, depth, "demo");
	void driveMockRun(run.id).catch((error: unknown) => {
		append(run.id, {
			runId: run.id,
			ts: new Date().toISOString(),
			seq: nextSequence(run),
			lane: "system",
			type: "error",
			payload: {
				message: error instanceof Error ? error.message : "Mock run failed",
				recoverable: false,
			},
		});
	});

	return run;
}

export async function waitForIcpConfirmation(runId: string): Promise<string> {
	const run = runs.get(runId);
	if (!run) {
		throw new Error(`Unknown run: ${runId}`);
	}

	await run.icpGate.promise;
	if (!run.selectedIcpId) {
		throw new Error(`Run ${runId} resumed without an ICP selection`);
	}

	return run.selectedIcpId;
}

export function registerRadarRunner(
	runId: string,
	runner: () => Promise<Lead | undefined>,
): void {
	const run = runs.get(runId);
	if (!run) {
		throw new Error(`Unknown run: ${runId}`);
	}

	run.radarRunner = runner;
}

export function confirmIcp(runId: string, icpId: string): boolean {
	const run = runs.get(runId);
	if (run?.state !== "ICP_CONFIRM") {
		return false;
	}
	const isKnownHypothesis = run.events.some(
		(event) =>
			event.type === "stage_change" &&
			event.payload.icps?.some((icp) => icp.id === icpId),
	);
	if (!isKnownHypothesis) {
		return false;
	}
	if (run.selectedIcpId && run.selectedIcpId !== icpId) {
		return false;
	}

	run.selectedIcpId = icpId;
	if (!run.icpGate.resolved) {
		run.icpGate.resolved = true;
		run.icpGate.resolve();
	}

	return true;
}

export function approveLead(
	runId: string,
	leadId: string,
): StoredDraft | undefined {
	const run = runs.get(runId);
	const draft = run?.drafts.get(leadId);
	if (!run || !draft || !run.leads.has(leadId)) {
		return undefined;
	}
	if (draft.status === "sent") {
		return draft;
	}

	const outreachDraft: OutreachDraft = {
		leadId: draft.leadId,
		channel: draft.channel,
		body: draft.body,
		groundedIn: draft.groundedIn,
		...(draft.subject ? { subject: draft.subject } : {}),
	};
	const sentDraft = { ...outreachDraft, status: "sent" as const };
	append(runId, {
		runId,
		ts: new Date().toISOString(),
		seq: nextSequence(run),
		lane: "composer",
		type: "draft_ready",
		payload: {
			draft: outreachDraft,
			status: "sent",
		},
	});

	return sentDraft;
}

export function triggerRadar(runId: string): Lead | undefined {
	const run = runs.get(runId);
	if (!run) {
		return undefined;
	}
	if (run.radarRunner) {
		void run.radarRunner().catch((error: unknown) => {
			append(runId, {
				runId,
				ts: new Date().toISOString(),
				seq: nextSequence(run),
				lane: "system",
				type: "error",
				payload: {
					message: error instanceof Error ? error.message : "Radar tick failed",
					recoverable: true,
				},
			});
		});
		return undefined;
	}

	const existingLead = run.radarLead;
	const lead: Lead =
		existingLead ??
		createRadarLead({
			runId,
			domain: run.domain,
			startedAt: new Date().toISOString(),
		});

	if (!existingLead) {
		run.radarLead = lead;

		append(runId, {
			runId,
			ts: new Date().toISOString(),
			seq: nextSequence(run),
			lane: "verifier",
			type: "radar_alert",
			payload: lead,
		});
	}

	if (run.state !== "RADAR") {
		append(runId, {
			runId,
			ts: new Date().toISOString(),
			seq: nextSequence(run),
			lane: "system",
			type: "stage_change",
			payload: { state: "RADAR" },
		});
	}

	return lead;
}
