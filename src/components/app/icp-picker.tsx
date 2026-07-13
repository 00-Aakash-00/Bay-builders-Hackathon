"use client";

import { useState } from "react";
import type { ICPHypothesis, ProductBrief } from "@/lib/schemas";
import motion from "./app-motion.module.css";

type IcpPickerProps = {
	brief?: ProductBrief;
	icps: ICPHypothesis[];
	confirmedIcp: string | null;
	onConfirm: (icpId: string) => Promise<boolean>;
};

export function IcpPicker({
	brief,
	icps,
	confirmedIcp,
	onConfirm,
}: IcpPickerProps) {
	const [selectedId, setSelectedId] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleConfirm() {
		if (!selectedId) return;
		setIsSubmitting(true);
		setError(null);

		try {
			const confirmed = await onConfirm(selectedId);
			if (!confirmed) {
				setError("The hypothesis could not be confirmed. Try again.");
				setIsSubmitting(false);
			}
		} catch {
			setError("The hypothesis could not be confirmed. Try again.");
			setIsSubmitting(false);
		}
	}

	return (
		<section
			className={`${motion.arrival} rounded-sm border border-mist bg-white p-24 shadow-sm-2 sm:p-32`}
			aria-labelledby="icp-gate-title"
		>
			<div className="mb-24">
				<p className="mb-8 text-caption uppercase tracking-widest text-steel">
					Required gate
				</p>
				<h2 id="icp-gate-title" className="font-fraktion text-heading-sm">
					Choose the hypothesis we should test.
				</h2>
				<p className="mt-8 text-body-sm text-iron">
					This is a starting belief, not a claim about who will buy.
				</p>
			</div>

			{brief ? (
				<div className="mb-24 grid gap-16 border-mist border-y bg-paper px-16 py-16 sm:grid-cols-3">
					<div>
						<p className="mb-8 text-caption text-steel">Product</p>
						<p className="text-body-sm text-obsidian">{brief.product}</p>
					</div>
					<div>
						<p className="mb-8 text-caption text-steel">Outcome</p>
						<p className="text-body-sm text-obsidian">{brief.outcome}</p>
					</div>
					<div>
						<p className="mb-8 text-caption text-steel">Buyer</p>
						<p className="text-body-sm text-obsidian">{brief.buyer}</p>
					</div>
				</div>
			) : (
				<p className="mb-24 border-mist border-y py-16 text-body-sm text-iron">
					Finishing the product playback…
				</p>
			)}

			{confirmedIcp ? (
				<div className="rounded-sm border border-mist bg-paper p-16 text-body-sm text-iron">
					Hypothesis confirmed. The swarm is preparing its search strategy…
				</div>
			) : (
				<fieldset>
					<legend className="sr-only">ICP hypotheses</legend>
					<div className="grid gap-16 md:grid-cols-2">
						{icps.map((icp) => {
							const isSelected = selectedId === icp.id;
							return (
								<label
									key={icp.id}
									className={`cursor-pointer rounded-sm border p-16 shadow-sm focus-within:ring-2 focus-within:ring-ash motion-safe:hover:shadow-sm-2 ${
										isSelected ? "border-ash bg-paper" : "border-mist bg-white"
									}`}
								>
									<input
										type="radio"
										name="icp"
										value={icp.id}
										checked={isSelected}
										onChange={() => setSelectedId(icp.id)}
										className="sr-only"
									/>
									<div className="mb-16 flex items-start gap-8">
										<span
											aria-hidden="true"
											className={`mt-1 size-16 shrink-0 rounded-full border ${
												isSelected
													? "border-graphite bg-graphite"
													: "border-ash bg-white"
											}`}
										/>
										<div>
											<p className="text-body font-medium text-obsidian">
												{icp.persona}
											</p>
											<p className="mt-8 text-caption text-steel">
												{icp.industry} · {icp.companySize}
											</p>
										</div>
									</div>
									<p className="mb-8 text-caption font-medium text-graphite">
										Pain triggers
									</p>
									<ul className="space-y-8 text-body-sm text-iron">
										{icp.painTriggers.slice(0, 3).map((trigger) => (
											<li key={trigger}>— {trigger}</li>
										))}
									</ul>
								</label>
							);
						})}
					</div>

					{icps.length === 0 ? (
						<p className="text-body-sm text-iron">Drafting hypotheses…</p>
					) : null}

					<div className="mt-24 flex flex-wrap items-center justify-between gap-16">
						{error ? (
							<p className="text-caption text-iron" role="alert">
								{error}
							</p>
						) : (
							<span />
						)}
						<button
							type="button"
							disabled={!selectedId || isSubmitting}
							onClick={handleConfirm}
							className="rounded-sm bg-glacier-tint px-16 py-16 text-body-sm font-medium text-obsidian transition-transform duration-150 ease-out-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
						>
							{isSubmitting ? "Confirming…" : "Confirm ICP"}
						</button>
					</div>
				</fieldset>
			)}
		</section>
	);
}
