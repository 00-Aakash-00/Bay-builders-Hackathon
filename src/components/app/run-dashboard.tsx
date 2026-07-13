"use client";

import {
	startTransition,
	useCallback,
	useEffect,
	useReducer,
	useRef,
	useState,
} from "react";
import type {
	ICPHypothesis,
	Lead,
	OutreachDraft,
	ProductBrief,
	RunEvent,
	RunState,
	ScoreBreakdown,
} from "@/lib/schemas";
import { RunEventSchema } from "@/lib/schemas";
import { CandidateTracker } from "./candidate-tracker";
import { IcpPicker } from "./icp-picker";
import { LeadCard } from "./lead-card";
import { RadarFeed } from "./radar-feed";
import { SwarmFeed } from "./swarm-feed";

type DraftRecord = {
	draft: OutreachDraft;
	status: "draft" | "sent";
};

type DashboardState = {
	domain: string;
	runState: RunState;
	brief?: ProductBrief;
	icps: ICPHypothesis[];
	events: RunEvent[];
	leads: Lead[];
	drafts: Record<string, DraftRecord>;
	radarAlerts: Lead[];
	budget: { spent: number; total: number };
};

type DashboardAction = { type: "event"; event: RunEvent };

type RunDashboardProps = {
	runId: string;
	mode: "live" | "demo";
	initialDomain: string;
	initialState: RunState;
	createdAt: string;
	initialBudget: { spent: number; total: number };
};

function upsertLead(leads: Lead[], lead: Lead) {
	const existingIndex = leads.findIndex((item) => item.id === lead.id);
	if (existingIndex === -1) return [...leads, lead];

	return leads.map((item, index) => (index === existingIndex ? lead : item));
}

function updateLeadScore(leads: Lead[], leadId: string, score: ScoreBreakdown) {
	return leads.map((lead) => (lead.id === leadId ? { ...lead, score } : lead));
}

function dashboardReducer(
	state: DashboardState,
	action: DashboardAction,
): DashboardState {
	const event = action.event;
	const nextState = { ...state, events: [...state.events, event] };

	switch (event.type) {
		case "stage_change": {
			const payload = event.payload;
			return {
				...nextState,
				runState: payload.state,
				domain: payload.domain ?? state.domain,
				brief: payload.brief ?? state.brief,
				icps: payload.icps ?? state.icps,
			};
		}
		case "lead_verified": {
			return {
				...nextState,
				leads: upsertLead(state.leads, event.payload),
			};
		}
		case "lead_scored": {
			const payload = event.payload;
			return {
				...nextState,
				leads: updateLeadScore(state.leads, payload.leadId, payload.score),
			};
		}
		case "draft_ready": {
			const payload = event.payload;
			return {
				...nextState,
				drafts: {
					...state.drafts,
					[payload.draft.leadId]: payload,
				},
			};
		}
		case "budget_update": {
			const payload = event.payload;
			return { ...nextState, budget: payload };
		}
		case "radar_alert": {
			return {
				...nextState,
				radarAlerts: upsertLead(state.radarAlerts, event.payload),
			};
		}
		default:
			return nextState;
	}
}

function parseEvent(data: string) {
	try {
		return RunEventSchema.safeParse(JSON.parse(data));
	} catch {
		return null;
	}
}

function formatDomain(domain: string) {
	try {
		return new URL(domain).hostname;
	} catch {
		return domain;
	}
}

function formatElapsed(totalSeconds: number) {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return hours > 0
		? `${hours}h ${minutes.toString().padStart(2, "0")}m`
		: `${minutes.toString().padStart(2, "0")}:${seconds
				.toString()
				.padStart(2, "0")}`;
}

function ElapsedTime({ createdAt }: { createdAt: string }) {
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		const startedAt = new Date(createdAt).getTime();
		const updateElapsed = () => {
			setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
		};

		updateElapsed();
		const interval = window.setInterval(updateElapsed, 1000);
		return () => window.clearInterval(interval);
	}, [createdAt]);

	return (
		<span className="font-mono text-caption">{formatElapsed(elapsed)}</span>
	);
}

function RunHeader({
	domain,
	runState,
	mode,
	createdAt,
	budget,
	connection,
}: {
	domain: string;
	runState: RunState;
	mode: "live" | "demo";
	createdAt: string;
	budget: { spent: number; total: number };
	connection: "connecting" | "live" | "reconnecting";
}) {
	const budgetPercent =
		budget.total > 0
			? Math.min(100, Math.round((budget.spent / budget.total) * 100))
			: 0;

	return (
		<header className="flex flex-col gap-16 border-mist border-b pb-24 lg:flex-row lg:items-end lg:justify-between">
			<div>
				<p className="mb-8 text-caption text-steel">Run workspace</p>
				<div className="flex flex-wrap items-center gap-8">
					<h1 className="font-fraktion text-heading tracking-tight">
						{formatDomain(domain)}
					</h1>
					<span className="rounded-sm bg-badge-slate px-8 py-8 text-caption text-white">
						{runState.replaceAll("_", " ")}
					</span>
					{mode === "demo" ? (
						<span className="rounded-sm border border-mist bg-cloud px-8 py-8 text-caption text-iron">
							demo data
						</span>
					) : null}
				</div>
			</div>

			<div className="flex flex-wrap items-end gap-24">
				<div>
					<p className="mb-8 text-caption text-steel">Elapsed</p>
					<ElapsedTime createdAt={createdAt} />
				</div>
				<div className="w-80">
					<div className="mb-8 flex items-center justify-between gap-16 text-caption">
						<span className="text-steel">Budget</span>
						<span className="font-mono text-iron">
							{budget.spent}/{budget.total}
						</span>
					</div>
					<meter
						className="sr-only"
						min={0}
						max={budget.total || 1}
						value={budget.spent}
					>
						{budgetPercent}%
					</meter>
					<div
						className="h-8 overflow-hidden rounded-sm bg-cloud"
						aria-hidden="true"
					>
						<div
							className="h-full bg-graphite"
							style={{ width: `${budgetPercent}%` }}
						/>
					</div>
				</div>
				<div className="flex items-center gap-8">
					<span className="text-caption text-steel">
						{connection === "live" ? "Live" : connection}
					</span>
					<button
						type="button"
						disabled
						title="Kill switch is not wired in the demo"
						className="rounded-sm border border-mist bg-white px-8 py-8 text-caption text-steel disabled:cursor-not-allowed"
					>
						Kill run
					</button>
				</div>
			</div>
		</header>
	);
}

export function RunDashboard({
	runId,
	mode,
	initialDomain,
	initialState,
	createdAt,
	initialBudget,
}: RunDashboardProps) {
	const [state, dispatch] = useReducer(dashboardReducer, {
		domain: initialDomain,
		runState: initialState,
		icps: [],
		events: [],
		leads: [],
		drafts: {},
		radarAlerts: [],
		budget: initialBudget,
	});
	const [activeTab, setActiveTab] = useState<"pipeline" | "radar">("pipeline");
	const [confirmedIcp, setConfirmedIcp] = useState<string | null>(null);
	const [optimisticSent, setOptimisticSent] = useState<Set<string>>(
		() => new Set(),
	);
	const [dismissedCandidateRejections, setDismissedCandidateRejections] =
		useState<Set<number>>(() => new Set());
	const [connection, setConnection] = useState<
		"connecting" | "live" | "reconnecting"
	>("connecting");
	const highestQueuedSeq = useRef(0);

	useEffect(() => {
		highestQueuedSeq.current = 0;
		const source = new EventSource(
			`/api/runs/${encodeURIComponent(runId)}/stream`,
		);
		const queue: RunEvent[] = [];
		let drainTimer: number | undefined;
		let draining = false;

		function drainQueue() {
			const nextEvent = queue.shift();
			if (!nextEvent) {
				draining = false;
				return;
			}

			startTransition(() => dispatch({ type: "event", event: nextEvent }));
			drainTimer = window.setTimeout(drainQueue, 40);
		}

		source.onopen = () => setConnection("live");
		source.onerror = () => setConnection("reconnecting");
		source.onmessage = (message) => {
			const parsed = parseEvent(message.data);
			if (!parsed?.success || parsed.data.seq <= highestQueuedSeq.current) {
				return;
			}

			highestQueuedSeq.current = parsed.data.seq;
			queue.push(parsed.data);
			if (!draining) {
				draining = true;
				drainQueue();
			}
		};

		return () => {
			source.close();
			if (drainTimer !== undefined) window.clearTimeout(drainTimer);
		};
	}, [runId]);

	const confirmIcp = useCallback(
		async (icpId: string) => {
			const response = await fetch(
				`/api/runs/${encodeURIComponent(runId)}/confirm-icp`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ icpId }),
				},
			);
			if (response.ok) setConfirmedIcp(icpId);
			return response.ok;
		},
		[runId],
	);

	const approveLead = useCallback(
		async (leadId: string) => {
			setOptimisticSent((current) => new Set(current).add(leadId));
			try {
				const response = await fetch(
					`/api/runs/${encodeURIComponent(runId)}/approve`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ leadId }),
					},
				);
				if (!response.ok) throw new Error("Lead approval failed");
			} catch {
				setOptimisticSent((current) => {
					const next = new Set(current);
					next.delete(leadId);
					return next;
				});
			}
		},
		[runId],
	);
	const dismissCandidateRejection = useCallback((rejectionSeq: number) => {
		setDismissedCandidateRejections((current) => {
			if (current.has(rejectionSeq)) return current;
			const next = new Set(current);
			next.add(rejectionSeq);
			return next;
		});
	}, []);

	return (
		<main className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-24 px-16 py-24 sm:px-24 lg:py-32">
			<RunHeader
				domain={state.domain}
				runState={state.runState}
				mode={mode}
				createdAt={createdAt}
				budget={state.budget}
				connection={connection}
			/>

			<div className="grid min-w-0 gap-24 lg:grid-cols-5">
				<div className="min-w-0 lg:col-span-2">
					<SwarmFeed events={state.events} />
				</div>

				<section className="min-w-0 lg:col-span-3" aria-label="Run results">
					<div
						className="mb-24 inline-flex rounded-sm border border-mist bg-white p-1"
						role="tablist"
						aria-label="Run views"
					>
						<button
							type="button"
							role="tab"
							aria-selected={activeTab === "pipeline"}
							onClick={() => setActiveTab("pipeline")}
							className={`rounded-sm px-16 py-8 text-caption transition-transform duration-150 ease-out-strong active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
								activeTab === "pipeline"
									? "bg-obsidian text-white"
									: "text-iron"
							}`}
						>
							Pipeline · {state.leads.length}
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={activeTab === "radar"}
							onClick={() => setActiveTab("radar")}
							className={`rounded-sm px-16 py-8 text-caption transition-transform duration-150 ease-out-strong active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
								activeTab === "radar" ? "bg-obsidian text-white" : "text-iron"
							}`}
						>
							Radar · {state.radarAlerts.length}
						</button>
					</div>

					{activeTab === "pipeline" ? (
						<div role="tabpanel" className="space-y-16">
							{state.runState === "ICP_CONFIRM" ? (
								<IcpPicker
									brief={state.brief}
									icps={state.icps}
									confirmedIcp={confirmedIcp}
									onConfirm={confirmIcp}
								/>
							) : null}

							<CandidateTracker
								dismissedRejections={dismissedCandidateRejections}
								events={state.events}
								onDismissRejected={dismissCandidateRejection}
								runState={state.runState}
							/>

							{state.leads.map((lead) => {
								const draftRecord = state.drafts[lead.id];
								return (
									<LeadCard
										key={lead.id}
										lead={lead}
										draft={draftRecord?.draft}
										isSent={
											draftRecord?.status === "sent" ||
											optimisticSent.has(lead.id)
										}
										onApprove={approveLead}
									/>
								);
							})}

							{state.runState !== "ICP_CONFIRM" && state.leads.length === 0 ? (
								<div className="rounded-sm border border-mist bg-white p-24 text-body-sm text-iron shadow-sm">
									Verified leads will collect here as they survive the gauntlet.
								</div>
							) : null}
						</div>
					) : (
						<RadarFeed runId={runId} alerts={state.radarAlerts} />
					)}
				</section>
			</div>
		</main>
	);
}
