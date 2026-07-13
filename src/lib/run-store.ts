import { createMockRunScript, createRadarLead } from "@/lib/mock/run-script";
import {
	type Lead,
	LeadSchema,
	type OutreachDraft,
	OutreachDraftSchema,
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

async function driveMockRun(run: StoredRun): Promise<void> {
	const steps = createMockRunScript({
		runId: run.id,
		domain: run.domain,
		startedAt: run.createdAt,
	});

	for (const step of steps) {
		if (step.kind === "pause") {
			await run.icpGate.promise;
			continue;
		}

		await new Promise((resolve) => setTimeout(resolve, step.delayMs));
		append(run.id, step.event);
	}
}

export function createRun(domain: string, depth: RunDepth = 10): RunRecord {
	const id = crypto.randomUUID();
	const createdAt = new Date().toISOString();
	const run: StoredRun = {
		id,
		domain,
		depth,
		state: "INTAKE",
		createdAt,
		events: [],
		budget: { spent: 0, total: 50 },
		leads: new Map(),
		drafts: new Map(),
		subscribers: new Set(),
		icpGate: createIcpGate(),
	};

	runs.set(id, run);
	void driveMockRun(run).catch((error: unknown) => {
		append(id, {
			runId: id,
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
