"use client";

import { useEffect, useMemo, useState } from "react";
import type { CandidateSignal, RunEvent, RunState } from "@/lib/schemas";
import motion from "./app-motion.module.css";

const MAX_VISIBLE_CANDIDATES = 8;

type CandidateStatus =
	| { kind: "pending" }
	| { kind: "killed"; reason: string; rejectionSeq: number };

type TrackedCandidate = {
	key: string;
	signal: CandidateSignal;
	status: CandidateStatus;
};

function candidateKey(signal: CandidateSignal) {
	return JSON.stringify([signal.url, signal.authorHandle ?? null]);
}

function dropOverflow(candidates: Map<string, TrackedCandidate>) {
	while (candidates.size > MAX_VISIBLE_CANDIDATES) {
		const oldestKilled = [...candidates].find(
			([, candidate]) => candidate.status.kind === "killed",
		)?.[0];
		const oldestKey = oldestKilled ?? candidates.keys().next().value;
		if (oldestKey === undefined) return;
		candidates.delete(oldestKey);
	}
}

function deriveCandidates(
	events: RunEvent[],
	dismissedRejections: ReadonlySet<number>,
) {
	const candidates = new Map<string, TrackedCandidate>();
	let hasFoundCandidate = false;

	for (const event of events) {
		switch (event.type) {
			case "signal_found": {
				hasFoundCandidate = true;
				const key = candidateKey(event.payload);
				candidates.delete(key);
				candidates.set(key, {
					key,
					signal: event.payload,
					status: { kind: "pending" },
				});
				dropOverflow(candidates);
				break;
			}
			case "signal_rejected": {
				for (const [key, candidate] of candidates) {
					const rejection = event.payload.signal;
					const matches =
						candidate.status.kind === "pending" &&
						candidate.signal.url === rejection.url &&
						(rejection.authorHandle === undefined ||
							candidate.signal.authorHandle === rejection.authorHandle);
					if (!matches) continue;

					if (dismissedRejections.has(event.seq)) {
						candidates.delete(key);
					} else {
						candidates.set(key, {
							...candidate,
							status: {
								kind: "killed",
								reason: event.payload.reason,
								rejectionSeq: event.seq,
							},
						});
					}
				}
				break;
			}
			case "lead_verified": {
				for (const [key, candidate] of candidates) {
					if (candidate.signal.url === event.payload.signal.url) {
						candidates.delete(key);
					}
				}
				break;
			}
		}
	}

	return { candidates: [...candidates.values()], hasFoundCandidate };
}

function CandidateRow({
	candidate,
	index,
	onDismiss,
}: {
	candidate: TrackedCandidate;
	index: number;
	onDismiss: (rejectionSeq: number) => void;
}) {
	const [exitingSeq, setExitingSeq] = useState<number | null>(null);
	const killedStatus =
		candidate.status.kind === "killed" ? candidate.status : null;
	const rejectionSeq = killedStatus?.rejectionSeq ?? null;
	const exiting = rejectionSeq !== null && exitingSeq === rejectionSeq;

	useEffect(() => {
		if (rejectionSeq === null) return;
		const timer = window.setTimeout(() => setExitingSeq(rejectionSeq), 1800);
		return () => window.clearTimeout(timer);
	}, [rejectionSeq]);

	return (
		<li
			className={`${motion.arrival} min-w-0 overflow-hidden px-16 py-16 ${
				exiting ? "opacity-0!" : ""
			}`}
			style={{ transitionDelay: exiting ? "0ms" : `${index * 40}ms` }}
			onTransitionEnd={(event) => {
				if (
					!exiting ||
					rejectionSeq === null ||
					event.target !== event.currentTarget ||
					event.propertyName !== "opacity"
				) {
					return;
				}
				onDismiss(rejectionSeq);
			}}
		>
			<div className="flex min-w-0 items-center gap-16">
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-baseline gap-8">
						<span className="shrink-0 font-mono text-caption text-steel">
							{candidate.signal.channel}
						</span>
						<p
							className={`min-w-0 truncate text-body-sm text-obsidian ${
								killedStatus ? "line-through decoration-pure-black" : ""
							}`}
						>
							{candidate.signal.title}
						</p>
					</div>
					<p className="mt-8 truncate text-caption text-iron">
						{candidate.signal.quoteCandidate}
					</p>
				</div>

				<span
					className={`max-w-[50%] shrink-0 truncate rounded-sm bg-cloud px-8 py-8 text-caption ${
						killedStatus
							? "text-pure-black"
							: "candidate-gauntlet-pulse text-iron"
					}`}
					title={killedStatus?.reason}
				>
					{killedStatus ? `killed — ${killedStatus.reason}` : "in the gauntlet"}
				</span>
			</div>
		</li>
	);
}

export function CandidateTracker({
	dismissedRejections,
	events,
	onDismissRejected,
	runState,
}: {
	dismissedRejections: ReadonlySet<number>;
	events: RunEvent[];
	onDismissRejected: (rejectionSeq: number) => void;
	runState: RunState;
}) {
	const { candidates, hasFoundCandidate } = useMemo(
		() => deriveCandidates(events, dismissedRejections),
		[events, dismissedRejections],
	);
	const isHuntActive = runState === "STRATEGY" || runState === "HUNTING";

	if (!isHuntActive && candidates.length === 0) return null;

	return (
		<section
			className="min-w-0 overflow-hidden rounded-sm border border-mist bg-white shadow-sm"
			aria-labelledby="candidate-gauntlet-heading"
		>
			<div className="border-mist border-b px-16 py-16">
				<h2
					id="candidate-gauntlet-heading"
					className="text-body-sm font-medium text-obsidian"
				>
					The gauntlet
				</h2>
			</div>

			{runState === "HUNTING" && !hasFoundCandidate ? (
				<p className="px-16 py-16 text-caption text-steel">
					hunters dispatched — first signals incoming
				</p>
			) : null}

			{candidates.length > 0 ? (
				<ul className="min-w-0 divide-y divide-mist">
					{candidates.map((candidate, index) => (
						<CandidateRow
							key={candidate.key}
							candidate={candidate}
							index={index}
							onDismiss={onDismissRejected}
						/>
					))}
				</ul>
			) : null}

			<style jsx global>{`
				.candidate-gauntlet-pulse {
					animation: candidate-gauntlet-pulse 1.6s var(--ease-in-out-strong) infinite;
				}

				@keyframes candidate-gauntlet-pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.55; }
				}

				@media (prefers-reduced-motion: reduce) {
					.candidate-gauntlet-pulse {
						animation-play-state: paused;
					}
				}
			`}</style>
		</section>
	);
}
