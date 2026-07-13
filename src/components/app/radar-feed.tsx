"use client";

import { useState } from "react";
import type { Lead } from "@/lib/schemas";
import motion from "./app-motion.module.css";

function relativeDate(value: string) {
	if (value === "date_unavailable") return "Date unavailable";
	const elapsedHours = Math.max(
		0,
		Math.round((Date.now() - new Date(value).getTime()) / 3_600_000),
	);
	if (elapsedHours < 24) return `${elapsedHours || 1}h ago`;
	return `${Math.round(elapsedHours / 24)}d ago`;
}

function RadarAlertCard({ lead }: { lead: Lead }) {
	const company = lead.enrichment.company ?? lead.signal.company;

	return (
		<article
			className={`${motion.arrival} relative overflow-hidden rounded-sm border border-mist bg-white p-24 pl-32 shadow-sm motion-safe:hover:shadow-sm-2`}
		>
			<div
				className="absolute inset-y-0 left-0 w-1 bg-glacier-tint"
				aria-hidden="true"
			/>
			<div className="flex flex-wrap items-start justify-between gap-16">
				<div>
					<p className="text-caption uppercase tracking-widest text-steel">
						New verified signal
					</p>
					<h3 className="mt-8 font-fraktion text-heading-sm">{lead.name}</h3>
					{company ? (
						<p className="mt-8 text-body-sm text-iron">{company}</p>
					) : null}
				</div>
				<div className="text-right">
					<p className="font-fraktion text-heading-sm">{lead.score.total}</p>
					<p className="text-caption text-steel">score</p>
				</div>
			</div>
			<blockquote className="mt-24 text-subheading text-obsidian">
				“{lead.signal.quote}”
			</blockquote>
			<div className="mt-16 flex flex-wrap items-center gap-16 text-caption text-steel">
				<a
					href={lead.signal.url}
					target="_blank"
					rel="noreferrer"
					className="underline underline-offset-2"
				>
					Open receipt
				</a>
				<span>{relativeDate(lead.signal.publishedAt)}</span>
			</div>
		</article>
	);
}

export function RadarFeed({
	runId,
	alerts,
}: {
	runId: string;
	alerts: Lead[];
}) {
	const [isTriggering, setIsTriggering] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function triggerRadar() {
		setIsTriggering(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/runs/${encodeURIComponent(runId)}/radar/trigger`,
				{ method: "POST" },
			);
			if (!response.ok) throw new Error("Radar trigger failed");
		} catch {
			setError("Radar could not run. Try again.");
		} finally {
			setIsTriggering(false);
		}
	}

	return (
		<div role="tabpanel">
			<div className="mb-24 flex flex-wrap items-end justify-between gap-16">
				<div>
					<p className="mb-8 text-caption text-steel">Standing monitor</p>
					<h2 className="font-fraktion text-heading-sm">Fresh signals</h2>
				</div>
				<button
					type="button"
					disabled={isTriggering}
					onClick={triggerRadar}
					className="rounded-sm bg-glacier-tint px-16 py-8 text-caption font-medium text-obsidian transition-transform duration-150 ease-out-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
				>
					{isTriggering ? "Hunting…" : "Trigger now"}
				</button>
			</div>

			{error ? (
				<p className="mb-16 text-caption text-iron" role="alert">
					{error}
				</p>
			) : null}

			<div className="space-y-16">
				{alerts.map((lead) => (
					<RadarAlertCard key={lead.id} lead={lead} />
				))}
				{alerts.length === 0 ? (
					<div className="rounded-sm border border-mist bg-white p-24 text-body-sm text-iron shadow-sm">
						No new deltas yet. Trigger the winning query pack when you are
						ready.
					</div>
				) : null}
			</div>
		</div>
	);
}
