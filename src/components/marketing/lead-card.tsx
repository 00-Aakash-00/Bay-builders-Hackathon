type LeadCardProps = {
	company: string;
	date: string;
	dateTime: string;
	name: string;
	persona: string;
	quote: string;
	rejected?: boolean;
	score: string;
	source: string;
	stage: string;
};

export function LeadCard({
	company,
	date,
	dateTime,
	name,
	persona,
	quote,
	rejected = false,
	score,
	source,
	stage,
}: LeadCardProps) {
	return (
		<article
			aria-label={`${rejected ? "Rejected" : "Verified"} lead: ${name}`}
			className="relative h-full overflow-hidden rounded-sm border border-mist bg-white p-24 pl-32 shadow-sm"
		>
			{rejected ? null : (
				<div
					aria-hidden="true"
					className="absolute inset-y-0 left-0 w-8 bg-glacier-tint"
				/>
			)}

			<div className="flex h-full flex-col">
				<div className="flex flex-wrap items-start justify-between gap-16">
					<span
						className={
							rejected
								? "text-caption font-semibold uppercase text-pure-black"
								: "rounded-sm bg-glacier-tint px-8 py-8 text-caption font-semibold uppercase text-obsidian"
						}
					>
						{rejected ? "Rejected signal" : "Verified receipt"}
					</span>
					<span className="rounded-sm bg-badge-slate px-8 py-8 text-caption font-semibold uppercase text-white">
						{stage}
					</span>
				</div>

				<div className="mt-24">
					<h3
						className={`font-fraktion text-subheading font-semibold ${rejected ? "text-iron" : "text-obsidian"}`}
					>
						{name}
					</h3>
					<p className="mt-8 text-body-sm text-iron">
						{persona} · {company}
					</p>
				</div>

				<blockquote className="mt-24 text-subheading font-medium text-obsidian">
					{rejected ? (
						<s className="text-pure-black decoration-pure-black">“{quote}”</s>
					) : (
						<>“{quote}”</>
					)}
				</blockquote>

				{rejected ? (
					<p className="mt-16 text-caption font-semibold text-pure-black">
						source re-fetch failed — quote not found
					</p>
				) : null}

				<div className="mt-auto grid gap-16 border-t border-mist pt-24 sm:grid-cols-[1fr_auto] sm:items-end">
					<div>
						<p className="text-caption font-semibold uppercase text-iron">
							Source
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-8">
							<a
								className="min-w-0 break-all font-mono text-caption text-iron hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
								href={`https://${source}`}
								rel="noreferrer"
								target="_blank"
							>
								{source}
							</a>
							<span aria-hidden="true" className="text-caption text-iron">
								·
							</span>
							<time className="text-caption text-iron" dateTime={dateTime}>
								{date}
							</time>
						</div>
					</div>
					<div className="sm:text-right">
						<p className="text-caption font-semibold uppercase text-iron">
							Score
						</p>
						<p
							className={`font-fraktion text-heading font-semibold ${rejected ? "text-iron" : "text-obsidian"}`}
						>
							{score}
						</p>
					</div>
				</div>
			</div>
		</article>
	);
}
