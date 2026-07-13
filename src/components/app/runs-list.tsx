"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RunListSnapshot } from "@/lib/run-store";
import motion from "./app-motion.module.css";

const activeRunStates: ReadonlySet<RunListSnapshot["state"]> = new Set([
	"INTAKE",
	"ICP_CONFIRM",
	"STRATEGY",
	"HUNTING",
]);

function formatDomain(domain: string) {
	try {
		return new URL(domain).hostname;
	} catch {
		return domain;
	}
}

function formatRelativeTime(createdAt: string) {
	const seconds = Math.max(
		0,
		Math.floor((Date.now() - Date.parse(createdAt)) / 1000),
	);
	if (seconds < 60) return `${seconds}s ago`;

	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	return `${Math.floor(hours / 24)}d ago`;
}

export function RunsList() {
	const [runs, setRuns] = useState<RunListSnapshot[] | null>(null);

	useEffect(() => {
		let active = true;
		let intervalId: number | undefined;
		let requestController: AbortController | undefined;

		async function loadRuns() {
			requestController?.abort();
			const controller = new AbortController();
			requestController = controller;
			try {
				const response = await fetch("/api/runs", {
					cache: "no-store",
					signal: controller.signal,
				});
				if (!response.ok) return;

				const result: unknown = await response.json();
				if (
					active &&
					requestController === controller &&
					Array.isArray(result)
				) {
					setRuns(result as RunListSnapshot[]);
				}
			} catch {
				// Keep the last successful list while the worker is unavailable.
			} finally {
				if (requestController === controller) {
					requestController = undefined;
				}
			}
		}

		function stopPolling() {
			if (intervalId !== undefined) {
				window.clearInterval(intervalId);
				intervalId = undefined;
			}
			requestController?.abort();
			requestController = undefined;
		}

		function startPolling() {
			if (document.visibilityState !== "visible" || intervalId !== undefined) {
				return;
			}
			void loadRuns();
			intervalId = window.setInterval(() => void loadRuns(), 10_000);
		}

		function handleVisibilityChange() {
			if (document.visibilityState === "visible") {
				startPolling();
			} else {
				stopPolling();
			}
		}

		if (document.visibilityState === "visible") {
			startPolling();
		} else {
			void loadRuns();
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			active = false;
			stopPolling();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
		};
	}, []);

	if (runs === null) return null;

	return (
		<section aria-labelledby="runs-heading">
			<h2
				id="runs-heading"
				className="mb-16 font-fraktion text-subheading tracking-tight text-obsidian"
			>
				Runs
			</h2>

			{runs.length === 0 ? (
				<p className="text-caption text-steel">
					No runs yet — point me at a startup above.
				</p>
			) : (
				<ul className="divide-y divide-mist overflow-hidden rounded-sm border border-mist bg-white shadow-sm">
					{runs.map((run, index) => (
						<li
							key={run.id}
							className={motion.arrival}
							style={{ transitionDelay: `${index * 40}ms` }}
						>
							<Link
								href={`/app/runs/${encodeURIComponent(run.id)}`}
								className="flex min-w-0 flex-col gap-8 px-16 py-16 transition-transform duration-150 ease-out-strong hover:bg-cloud active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100 sm:flex-row sm:items-center sm:justify-between sm:gap-16"
							>
								<div className="flex min-w-0 flex-1 items-center gap-8">
									{activeRunStates.has(run.state) ? (
										<span
											aria-hidden="true"
											className="run-live-indicator size-8 shrink-0 rounded-full bg-obsidian"
										/>
									) : null}
									<p className="min-w-0 truncate text-body-sm font-semibold text-obsidian">
										{formatDomain(run.domain)}
									</p>
								</div>

								<div className="flex flex-wrap items-center gap-8">
									<span className="rounded-sm bg-badge-slate px-8 py-8 text-caption text-white">
										{run.state.replaceAll("_", " ")}
									</span>
									{run.mode === "demo" ? (
										<span className="rounded-sm border border-mist bg-cloud px-8 py-8 text-caption text-iron">
											demo data
										</span>
									) : null}
									<span className="text-caption text-steel">
										{run.leadCount} {run.leadCount === 1 ? "lead" : "leads"}
									</span>
									<span aria-hidden="true" className="text-caption text-steel">
										·
									</span>
									<time
										dateTime={run.createdAt}
										className="text-caption text-steel"
									>
										{formatRelativeTime(run.createdAt)}
									</time>
								</div>
							</Link>
						</li>
					))}
				</ul>
			)}

			<style jsx global>{`
				.run-live-indicator {
					animation: run-live-pulse 1.6s var(--ease-in-out-strong) infinite;
				}

				@keyframes run-live-pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.55; }
				}

				@media (prefers-reduced-motion: reduce) {
					.run-live-indicator {
						animation-play-state: paused;
					}
				}
			`}</style>
		</section>
	);
}
