"use client";

import type { Lead, OutreachDraft } from "@/lib/schemas";
import motion from "./app-motion.module.css";

const dateFormatter = new Intl.DateTimeFormat("en", {
	month: "short",
	day: "numeric",
	year: "numeric",
});

function formatDate(value: string) {
	if (value === "date_unavailable") return "Date unavailable";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function titleCase(value: string) {
	return value.replaceAll("_", " ");
}

function ScoreDial({ score }: { score: number }) {
	const radius = 23;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference * (1 - score / 100);

	return (
		<div
			className="relative grid size-56 shrink-0 place-items-center"
			role="img"
			aria-label={`Lead score ${score} out of 100`}
		>
			<svg
				className="absolute inset-0 size-full"
				viewBox="0 0 56 56"
				role="img"
				aria-hidden="true"
			>
				<circle
					cx="28"
					cy="28"
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					className="text-cloud"
				/>
				<circle
					cx="28"
					cy="28"
					r={radius}
					fill="none"
					stroke="currentColor"
					strokeWidth="3"
					strokeLinecap="round"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					className="origin-center -rotate-90 text-obsidian"
				/>
			</svg>
			<span className="font-fraktion text-heading-sm text-obsidian">
				{score}
			</span>
		</div>
	);
}

type LeadCardProps = {
	lead: Lead;
	draft?: OutreachDraft;
	isSent: boolean;
	onApprove: (leadId: string) => Promise<void>;
};

export function LeadCard({ lead, draft, isSent, onApprove }: LeadCardProps) {
	const company = lead.enrichment.company ?? lead.signal.company;

	return (
		<article
			className={`${motion.arrival} relative overflow-hidden rounded-sm border border-mist bg-white shadow-sm motion-safe:hover:shadow-sm-2`}
		>
			<div
				className="absolute inset-y-0 left-0 w-1 bg-glacier-tint"
				aria-hidden="true"
			/>
			<div className="p-24 pl-32">
				<div className="mb-24 flex items-start justify-between gap-16">
					<div className="min-w-0">
						<p className="text-caption text-steel">
							Potential customer based on public signals
						</p>
						<h2 className="mt-8 font-fraktion text-heading-sm text-obsidian">
							{lead.name}
						</h2>
						<div className="mt-8 flex flex-wrap items-center gap-8">
							{company ? (
								<span className="text-body-sm text-iron">{company}</span>
							) : null}
							<span className="rounded-sm bg-badge-slate px-8 py-8 text-caption text-white">
								{titleCase(lead.score.stage)}
							</span>
						</div>
					</div>
					<ScoreDial score={lead.score.total} />
				</div>

				<blockquote className="border-mist border-y py-24 text-subheading text-obsidian">
					“{lead.signal.quote}”
				</blockquote>

				<div className="mt-16 flex flex-wrap items-center gap-x-16 gap-y-8 text-caption text-steel">
					<a
						href={lead.signal.url}
						target="_blank"
						rel="noreferrer"
						className="underline underline-offset-2"
					>
						View source
					</a>
					<span>{formatDate(lead.signal.publishedAt)}</span>
					<span>{titleCase(lead.enrichment.channel.kind)}</span>
				</div>

				<div className="mt-24 grid gap-16 sm:grid-cols-2">
					<div>
						<p className="mb-8 text-caption font-medium text-graphite">
							Why fit
						</p>
						<p className="text-body-sm text-iron">{lead.whyFit}</p>
					</div>
					<div>
						<p className="mb-8 text-caption font-medium text-graphite">
							Why now
						</p>
						<p className="text-body-sm text-iron">{lead.whyNow}</p>
					</div>
				</div>

				<p className="mt-24 font-mono text-caption text-steel">
					Pain {lead.score.pain}/5 · Fit {lead.score.fit}/5 · Timing{" "}
					{lead.score.timing}/5 · Reach {lead.score.reachability}/5 · Evidence{" "}
					{lead.score.evidenceQuality}/5
				</p>

				{draft ? (
					<details className="mt-24 border-mist border-t pt-16">
						<summary className="cursor-pointer text-body-sm font-medium text-graphite">
							View grounded draft
						</summary>
						<div className="mt-16 rounded-sm bg-paper p-16">
							{draft.subject ? (
								<p className="mb-8 text-caption font-medium text-graphite">
									Subject: {draft.subject}
								</p>
							) : null}
							<p className="whitespace-pre-wrap text-body-sm text-iron">
								{draft.body}
							</p>
							<div className="mt-16 flex flex-wrap items-center justify-between gap-16">
								<p className="text-caption text-steel">
									Via {titleCase(draft.channel)}
								</p>
								<button
									type="button"
									disabled={isSent}
									onClick={() => onApprove(lead.id)}
									className="rounded-sm bg-glacier-tint px-16 py-8 text-caption font-medium text-obsidian transition-transform duration-150 ease-out-strong active:scale-[0.97] disabled:cursor-default disabled:bg-cloud disabled:text-iron motion-reduce:transition-none motion-reduce:active:scale-100"
								>
									{isSent ? "Sent ✓" : "Approve & send"}
								</button>
							</div>
						</div>
					</details>
				) : null}
			</div>
		</article>
	);
}
