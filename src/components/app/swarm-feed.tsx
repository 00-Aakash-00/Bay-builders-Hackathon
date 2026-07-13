"use client";

import { useEffect, useRef, useState } from "react";
import type { RunEvent } from "@/lib/schemas";
import motion from "./app-motion.module.css";

function eventDescription(event: RunEvent) {
	switch (event.type) {
		case "stage_change": {
			if (event.payload.state === "INTAKE" && event.payload.brief) {
				return `briefed ${event.payload.brief.product}`;
			}
			if (event.payload.state === "ICP_CONFIRM" && event.payload.icps) {
				return `stage → icp confirm · ${event.payload.icps.length} hypotheses`;
			}
			if (event.payload.state === "STRATEGY" && event.payload.queryPlan) {
				return `strategy → ${event.payload.queryPlan.packs.length} query packs`;
			}
			return `stage → ${event.payload.state.toLowerCase().replaceAll("_", " ")}`;
		}
		case "signal_found": {
			return `found “${event.payload.title}”`;
		}
		case "signal_rejected": {
			return `rejected “${event.payload.signal.title}” — ${event.payload.reason}`;
		}
		case "lead_verified": {
			return `verified ${event.payload.name}${event.payload.signal.company ? ` · ${event.payload.signal.company}` : ""}`;
		}
		case "lead_scored": {
			return `scored ${event.payload.leadId} → ${event.payload.score.total}`;
		}
		case "draft_ready": {
			return event.payload.status === "sent"
				? `sent outreach for ${event.payload.draft.leadId}`
				: `drafted outreach for ${event.payload.draft.leadId}`;
		}
		case "strategy_pivot": {
			return event.payload.rationale;
		}
		case "budget_update": {
			return `${event.payload.provider ? `${event.payload.provider} · ` : ""}budget ${event.payload.spent}/${event.payload.total}`;
		}
		case "radar_alert": {
			return `radar verified ${event.payload.name}`;
		}
		case "agent_started":
			return event.payload.message;
		case "tool_call":
			return event.payload.action;
		case "error":
			return event.payload.message;
	}
}

type LaneUnit = {
	kind: "lane";
	lane: string;
	events: RunEvent[];
	lastSeq: number;
};

type PivotUnit = {
	kind: "pivot";
	event: Extract<RunEvent, { type: "strategy_pivot" }>;
	lastSeq: number;
};

function groupFeed(events: RunEvent[]): Array<LaneUnit | PivotUnit> {
	const lanes = new Map<string, RunEvent[]>();
	const pivots: PivotUnit[] = [];

	for (const event of events) {
		if (event.type === "strategy_pivot") {
			pivots.push({ kind: "pivot", event, lastSeq: event.seq });
			continue;
		}

		const laneEvents = lanes.get(event.lane) ?? [];
		laneEvents.push(event);
		lanes.set(event.lane, laneEvents);
	}

	const laneUnits: LaneUnit[] = Array.from(lanes, ([lane, laneEvents]) => ({
		kind: "lane",
		lane,
		events: laneEvents,
		lastSeq: laneEvents.at(-1)?.seq ?? 0,
	}));

	return [...laneUnits, ...pivots].toSorted(
		(left, right) => left.lastSeq - right.lastSeq,
	);
}

export function SwarmFeed({ events }: { events: RunEvent[] }) {
	const scrollArea = useRef<HTMLDivElement>(null);
	const pinned = useRef(true);
	const [showJump, setShowJump] = useState(false);
	const feedUnits = groupFeed(events);
	const eventCount = events.length;

	useEffect(() => {
		const element = scrollArea.current;
		if (eventCount > 0 && element && pinned.current) {
			element.scrollTop = element.scrollHeight;
		}
	}, [eventCount]);

	function handleScroll() {
		const element = scrollArea.current;
		if (!element) return;

		const distanceFromBottom =
			element.scrollHeight - element.scrollTop - element.clientHeight;
		pinned.current = distanceFromBottom < 24;
		setShowJump(!pinned.current);
	}

	function jumpToLatest() {
		const element = scrollArea.current;
		if (!element) return;
		element.scrollTop = element.scrollHeight;
		pinned.current = true;
		setShowJump(false);
	}

	return (
		<section className="lg:sticky lg:top-80" aria-labelledby="swarm-title">
			<div className="mb-16 flex items-end justify-between gap-16">
				<div>
					<p className="mb-8 text-caption text-steel">Live audit trail</p>
					<h2 id="swarm-title" className="font-fraktion text-heading-sm">
						Swarm feed
					</h2>
				</div>
				<span className="font-mono text-caption text-steel">
					{events.length} events
				</span>
			</div>

			<div className="relative overflow-hidden rounded-sm border border-mist bg-white shadow-sm">
				<div
					ref={scrollArea}
					onScroll={handleScroll}
					className="h-[65svh] min-h-80 overflow-y-auto p-16"
					role="log"
					aria-live="polite"
				>
					<ol className="space-y-16">
						{feedUnits.map((unit) =>
							unit.kind === "pivot" ? (
								<li
									key={`pivot-${unit.event.seq}`}
									className={`${motion.arrival} border-glacier-tint border-l-2 bg-paper px-16 py-16 font-mono text-caption text-iron`}
								>
									<span className="mb-8 block text-steel">strategy pivot</span>
									<span className="text-graphite">
										{eventDescription(unit.event)}
									</span>
								</li>
							) : (
								<li
									key={unit.lane}
									className="overflow-hidden rounded-sm border border-cloud"
								>
									<div className="flex items-center justify-between gap-8 bg-paper px-8 py-8 font-mono text-caption text-steel">
										<span className="truncate">{unit.lane}</span>
										<span>{unit.events.length}</span>
									</div>
									<ol>
										{unit.events.map((event) => (
											<li
												key={event.seq}
												className={`${motion.arrival} border-cloud border-t px-8 py-8 font-mono text-caption text-iron ${
													event.type === "signal_rejected"
														? "text-pure-black line-through"
														: ""
												}`}
											>
												{eventDescription(event)}
											</li>
										))}
									</ol>
								</li>
							),
						)}
					</ol>
					{events.length === 0 ? (
						<p className="font-mono text-caption text-iron">
							Waiting for the first agent handoff…
						</p>
					) : null}
				</div>

				{showJump ? (
					<button
						type="button"
						onClick={jumpToLatest}
						className="absolute right-16 bottom-16 rounded-sm border border-mist bg-white px-16 py-8 text-caption text-graphite shadow-sm-2 transition-transform duration-150 ease-out-strong active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
					>
						Jump to latest
					</button>
				) : null}
			</div>
		</section>
	);
}
