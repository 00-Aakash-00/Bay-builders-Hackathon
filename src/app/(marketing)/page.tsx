import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DitherPhoto } from "@/components/marketing/dither-photo";
import { HeroWorld } from "@/components/marketing/hero-world";
import styles from "@/components/marketing/marketing.module.css";
import { Reveal } from "@/components/marketing/reveal";

const heroDescription =
	"Paste your domain. An agent swarm hunts live pain signals across the web, verifies every source, and drafts outreach you send from your own Gmail.";

export const metadata: Metadata = {
	title: "CustomerZero — your first 10 customers, with receipts",
	description: heroDescription,
};

function CheckMark({ className = "" }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			height="14"
			viewBox="0 0 16 16"
			width="14"
		>
			<path
				d="m3.25 8.5 3 3 6.5-7.5"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.75"
			/>
		</svg>
	);
}

function CrossMark({ className = "" }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			height="14"
			viewBox="0 0 16 16"
			width="14"
		>
			<path
				d="m4 4 8 8M12 4l-8 8"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.75"
			/>
		</svg>
	);
}

const eyebrow =
	"font-mono text-caption font-semibold uppercase tracking-[0.16em] text-iron";

const alternatives = [
	{
		title: "Sales databases",
		body: "Who matches a filter — never who has the pain this week.",
	},
	{
		title: "AI SDRs",
		body: "Volume spray, collapsing reply rates, and a sender nobody trusts.",
	},
];

const proofPoints = ["a quote", "a link", "a timestamp"];

type Step = {
	title: string;
	body: string;
	icon: ReactNode;
};

const steps: Step[] = [
	{
		title: "Paste your domain",
		body: "Your live site becomes the product brief.",
		icon: (
			<svg
				aria-hidden="true"
				fill="none"
				height="20"
				viewBox="0 0 20 20"
				width="20"
			>
				<circle
					cx="10"
					cy="10"
					r="7.25"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<path d="M2.75 10h14.5" stroke="currentColor" strokeWidth="1.5" />
				<path
					d="M10 2.75c1.9 2 2.9 4.6 2.9 7.25s-1 5.25-2.9 7.25c-1.9-2-2.9-4.6-2.9-7.25s1-5.25 2.9-7.25Z"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
	{
		title: "Confirm your ICP (60 seconds)",
		body: "Pick or edit one focused hypothesis.",
		icon: (
			<svg
				aria-hidden="true"
				fill="none"
				height="20"
				viewBox="0 0 20 20"
				width="20"
			>
				<circle
					cx="10"
					cy="10"
					r="7.25"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
			</svg>
		),
	},
	{
		title: "The swarm hunts — and kills anything it can’t prove",
		body: "Every lead carries a quote, a link, a timestamp.",
		icon: (
			<svg
				aria-hidden="true"
				fill="none"
				height="20"
				viewBox="0 0 20 20"
				width="20"
			>
				<circle
					cx="10"
					cy="10"
					r="5.5"
					stroke="currentColor"
					strokeWidth="1.5"
				/>
				<path
					d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3"
					stroke="currentColor"
					strokeLinecap="round"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
	{
		title: "Approve; it sends from your Gmail",
		body: "Every draft stays in your hands.",
		icon: (
			<svg
				aria-hidden="true"
				fill="none"
				height="20"
				viewBox="0 0 20 20"
				width="20"
			>
				<path
					d="M17.5 2.5 9 11"
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="1.5"
				/>
				<path
					d="M17.5 2.5 12 17.5 9 11 2.5 8z"
					stroke="currentColor"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="1.5"
				/>
			</svg>
		),
	},
];

const receipts = [
	{
		rejected: false,
		stage: "problem aware",
		name: "Rina Patel",
		persona: "Head of Customer Success",
		company: "Pylonworks",
		quote:
			"We lose the why behind customer requests between calls and the roadmap. I need the evidence attached.",
		source: "github.com/pylonworks/feedback/issues/184",
		dateTime: "2026-07-11",
		date: "July 11, 2026",
		score: "82",
	},
	{
		rejected: true,
		stage: "trigger present",
		name: "Tom Becker",
		persona: "Founder",
		company: "RelayDesk",
		quote: "Looking for a better way to find early design partners this month.",
		source: "reddit.com/r/SaaS/comments/1m2cq9",
		dateTime: "2026-07-09",
		date: "July 9, 2026",
		score: "—",
	},
];

const radarRows = [
	{ lane: "reddit", event: "pain signal found in r/startups", time: "now" },
	{ lane: "verifier", event: "quote matched · source current", time: "+04s" },
	{ lane: "github", event: "new issue fits the winning ICP", time: "+11s" },
	{ lane: "radar", event: "verified lead added to shortlist", time: "+16s" },
];

export default function MarketingPage() {
	return (
		<main
			className="scroll-mt-80 flex-1 bg-paper text-obsidian"
			id="main-content"
			tabIndex={-1}
		>
			<HeroWorld />

			<div className="mx-auto w-full max-w-7xl border-x border-mist">
				<section
					aria-labelledby="dead-zone-title"
					className="border-b border-mist"
				>
					<div className="w-full px-16 py-72 sm:px-24 md:py-80 lg:px-32">
						<Reveal>
							<p className={eyebrow}>The dead zone</p>
							<h2
								className="mt-16 max-w-2xl font-fraktion text-heading font-semibold text-obsidian"
								id="dead-zone-title"
							>
								Pre-seed founders don’t need more rows. They need proof of pain.
							</h2>
						</Reveal>

						<div className="mt-40 grid gap-16 lg:grid-cols-2 lg:items-stretch">
							<Reveal className="h-full">
								<article className="flex h-full flex-col rounded-sm border border-mist bg-white p-32 shadow-sm">
									<p className="font-fraktion text-heading-sm font-semibold text-obsidian">
										10 verified people with receipts, sent by you.
									</p>
									<div className="mt-32 rounded-sm bg-glacier-tint p-16">
										<p className="font-mono text-caption font-semibold uppercase tracking-[0.12em] text-obsidian">
											Every lead carries
										</p>
										<ul className="mt-16 flex flex-wrap gap-x-24 gap-y-8">
											{proofPoints.map((point) => (
												<li
													className="flex items-center gap-8 font-mono text-caption text-obsidian"
													key={point}
												>
													<CheckMark />
													{point}
												</li>
											))}
										</ul>
									</div>
									<p className={`mt-auto pt-32 ${eyebrow}`}>The deliverable</p>
								</article>
							</Reveal>

							<Reveal className="h-full" delay={50}>
								<article className="flex h-full flex-col rounded-sm border border-mist bg-paper p-32">
									<div className="flex-1 divide-y divide-mist">
										{alternatives.map((alt) => (
											<div className="py-24 first:pt-0" key={alt.title}>
												<h3 className="font-fraktion text-subheading font-semibold text-iron">
													{alt.title}
												</h3>
												<p className="mt-8 text-body-sm text-steel">
													{alt.body}
												</p>
											</div>
										))}
									</div>
									<p className={`mt-auto pt-32 ${eyebrow}`}>The alternatives</p>
								</article>
							</Reveal>
						</div>
					</div>
				</section>

				<section
					aria-labelledby="how-it-works-title"
					className="scroll-mt-80 border-b border-mist"
					id="how-it-works"
				>
					<div className="w-full px-16 py-72 sm:px-24 md:py-80 lg:px-32">
						<Reveal>
							<p className={eyebrow}>How it works</p>
							<h2
								className="mt-16 max-w-2xl font-fraktion text-heading font-semibold text-obsidian"
								id="how-it-works-title"
							>
								One brief. One human gate. Then the swarm goes hunting.
							</h2>
						</Reveal>

						<div className="mt-40 grid gap-16 sm:grid-cols-2 lg:grid-cols-4">
							{steps.map((step, index) => (
								<Reveal className="h-full" delay={index * 50} key={step.title}>
									<article className="flex h-full flex-col rounded-sm border border-mist bg-white p-24 shadow-sm">
										<span
											aria-hidden="true"
											className="flex size-40 items-center justify-center rounded-sm border border-mist bg-paper text-obsidian"
										>
											{step.icon}
										</span>
										<h3 className="mt-24 font-fraktion text-subheading font-semibold text-obsidian">
											{step.title}
										</h3>
										<p className="mt-8 text-body-sm text-iron">{step.body}</p>
									</article>
								</Reveal>
							))}
						</div>
					</div>
				</section>

				<section aria-label="The swarm" className="border-b border-mist">
					<div className="w-full px-16 py-72 sm:px-24 md:py-80 lg:px-32">
						<Reveal>
							<div className="relative overflow-hidden rounded-sm border border-mist bg-obsidian shadow-sm-2">
								<div aria-hidden="true" className="absolute inset-0">
									<DitherPhoto
										className="h-full w-full"
										image="/brand/swarm.webp"
									/>
								</div>
								<div
									aria-hidden="true"
									className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/60 to-obsidian/10"
								/>
								<div className="relative flex min-h-[360px] flex-col justify-end p-24 sm:min-h-[460px] sm:p-40">
									<p className="font-mono text-caption font-semibold uppercase tracking-[0.16em] text-glacier-tint">
										The swarm
									</p>
									<h2 className="mt-16 max-w-2xl font-fraktion text-heading font-semibold text-white">
										The swarm hunts. The verifier decides what survives.
									</h2>
								</div>
							</div>
						</Reveal>
					</div>
				</section>

				<section
					aria-labelledby="receipts-title"
					className="scroll-mt-80 border-b border-mist"
					id="receipts"
				>
					<div className="w-full px-16 py-72 sm:px-24 md:py-80 lg:px-32">
						<Reveal>
							<div className="grid gap-24 lg:grid-cols-2 lg:items-end">
								<div>
									<p className={eyebrow}>Receipts</p>
									<h2
										className="mt-16 font-fraktion text-heading font-semibold text-obsidian"
										id="receipts-title"
									>
										Evidence or it doesn’t exist.
									</h2>
								</div>
								<p className="max-w-xl text-body text-iron lg:justify-self-end">
									An adversarial verifier re-fetches every source. Leads that
									fail die before you ever see them.
								</p>
							</div>
						</Reveal>

						<div className="mt-40 grid gap-y-40 md:grid-cols-2 md:grid-rows-[auto_auto_auto_auto] md:gap-y-0">
							{receipts.map((receipt, index) => (
								<Reveal
									className={
										index === 0
											? "md:row-span-4 md:grid md:grid-rows-subgrid md:pr-40"
											: "border-t border-mist pt-40 md:row-span-4 md:grid md:grid-rows-subgrid md:border-t-0 md:border-l md:border-mist md:pt-0 md:pl-40"
									}
									delay={index * 50}
									key={receipt.name}
								>
									<div className="flex flex-wrap items-center justify-between gap-16">
										<span className="flex items-center gap-8">
											<span
												className={
													receipt.rejected
														? "flex size-24 items-center justify-center rounded-sm bg-cloud text-pure-black"
														: "flex size-24 items-center justify-center rounded-sm bg-glacier-tint text-obsidian"
												}
											>
												{receipt.rejected ? <CrossMark /> : <CheckMark />}
											</span>
											<span
												className={`font-mono text-caption font-semibold uppercase tracking-[0.12em] ${receipt.rejected ? "text-pure-black" : "text-obsidian"}`}
											>
												{receipt.rejected
													? "Rejected signal"
													: "Verified receipt"}
											</span>
										</span>
										<span className="rounded-sm bg-badge-slate px-8 py-8 text-caption font-semibold uppercase text-white">
											{receipt.stage}
										</span>
									</div>

									<div className="mt-24 border-t border-dashed border-mist pt-24">
										<h3
											className={`font-fraktion text-subheading font-semibold ${receipt.rejected ? "text-iron" : "text-obsidian"}`}
										>
											{receipt.name}
										</h3>
										<p className="mt-8 text-body-sm text-iron">
											{receipt.persona} · {receipt.company}
										</p>
									</div>

									<div className="mt-24 border-t border-dashed border-mist pt-24">
										<blockquote className="text-subheading font-medium text-obsidian">
											{receipt.rejected ? (
												<s className="text-pure-black decoration-pure-black">
													“{receipt.quote}”
												</s>
											) : (
												<>“{receipt.quote}”</>
											)}
										</blockquote>
										{receipt.rejected ? (
											<p className="mt-16 font-mono text-caption font-semibold text-pure-black">
												source re-fetch failed — quote not found
											</p>
										) : null}
									</div>

									<div className="mt-24 grid gap-16 border-t border-dashed border-mist pt-24 sm:grid-cols-[1fr_auto] sm:items-end">
										<div>
											<p className="font-mono text-caption font-semibold uppercase text-iron">
												Source
											</p>
											<div className="mt-8 flex flex-wrap items-center gap-8">
												<a
													className="min-w-0 break-all font-mono text-caption text-iron hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
													href={`https://${receipt.source}`}
													rel="noreferrer"
													target="_blank"
												>
													{receipt.source}
												</a>
												<span
													aria-hidden="true"
													className="text-caption text-iron"
												>
													·
												</span>
												<time
													className="text-caption text-iron"
													dateTime={receipt.dateTime}
												>
													{receipt.date}
												</time>
											</div>
										</div>
										<div className="sm:text-right">
											<p className="font-mono text-caption font-semibold uppercase text-iron">
												Score
											</p>
											<p
												className={`font-fraktion text-heading font-semibold ${receipt.rejected ? "text-iron" : "text-obsidian"}`}
											>
												{receipt.score}
											</p>
										</div>
									</div>
								</Reveal>
							))}
						</div>
					</div>
				</section>

				<section aria-label="Proof" className="border-b border-mist">
					<div className="w-full px-16 py-72 sm:px-24 md:py-80 lg:px-32">
						<Reveal>
							<div className="relative overflow-hidden rounded-sm border border-mist bg-obsidian shadow-sm-2">
								<div aria-hidden="true" className="absolute inset-0">
									<DitherPhoto
										className="h-full w-full"
										image="/brand/proof.webp"
									/>
								</div>
								<div
									aria-hidden="true"
									className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/60 to-obsidian/10"
								/>
								<div className="relative flex min-h-[300px] flex-col justify-end p-24 sm:min-h-[380px] sm:p-40">
									<p className="font-mono text-caption font-semibold uppercase tracking-[0.16em] text-glacier-tint">
										Proof
									</p>
									<h2 className="mt-16 max-w-2xl font-fraktion text-heading font-semibold text-white">
										Every lead comes with the paper.
									</h2>
								</div>
							</div>
						</Reveal>
					</div>
				</section>

				<section aria-labelledby="radar-title" className="border-b border-mist">
					<div className="grid w-full gap-40 px-16 py-72 sm:px-24 md:py-80 lg:grid-cols-2 lg:items-center lg:px-32">
						<Reveal>
							<p className={eyebrow}>Standing radar</p>
							<h2
								className="mt-16 max-w-xl font-fraktion text-heading font-semibold text-obsidian"
								id="radar-title"
							>
								Ten now. The next hundred on radar.
							</h2>
							<p className="mt-24 max-w-xl text-body text-iron">
								The run finds your first ten; the standing radar streams the
								next hundred. It reuses the winning queries and only surfaces
								new signals that survive the same verifier.
							</p>
						</Reveal>

						<Reveal delay={50}>
							<section
								aria-label="Example standing radar feed"
								className="rounded-sm border border-mist bg-white p-24 shadow-sm"
							>
								<div className="flex items-center justify-between gap-16">
									<p className="font-mono text-caption font-semibold uppercase text-obsidian">
										Live signal feed
									</p>
									<p className="font-mono text-caption text-iron">radar_01</p>
								</div>
								<div className="mt-24">
									{radarRows.map((row) => (
										<div
											className={`${styles.radarRow} grid grid-cols-[auto_1fr_auto] gap-16 border-t border-mist py-16 first:border-t-0`}
											key={row.lane}
										>
											<span className="font-mono text-caption font-semibold text-obsidian">
												{row.lane}
											</span>
											<span className="font-mono text-caption text-iron">
												{row.event}
											</span>
											<span className="font-mono text-caption text-iron">
												{row.time}
											</span>
										</div>
									))}
								</div>
							</section>
						</Reveal>
					</div>
				</section>

				<section aria-label="The web" className="border-b border-mist">
					<div className="w-full px-16 py-72 sm:px-24 md:py-80 lg:px-32">
						<Reveal>
							<div className="relative overflow-hidden rounded-sm border border-mist bg-obsidian shadow-sm-2">
								<div aria-hidden="true" className="absolute inset-0">
									<DitherPhoto
										className="h-full w-full"
										image="/brand/web.webp"
									/>
								</div>
								<div
									aria-hidden="true"
									className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/60 to-obsidian/10"
								/>
								<div className="relative flex min-h-[300px] flex-col justify-end p-24 sm:min-h-[380px] sm:p-40">
									<p className="font-mono text-caption font-semibold uppercase tracking-[0.16em] text-glacier-tint">
										The web
									</p>
									<h2 className="mt-16 max-w-2xl font-fraktion text-heading font-semibold text-white">
										Your customers are already talking. Somewhere out there.
									</h2>
								</div>
							</div>
						</Reveal>
					</div>
				</section>

				<section
					aria-labelledby="cta-title"
					className="scroll-mt-80"
					id="get-started"
				>
					<div className="w-full px-16 py-80 sm:px-24 md:py-[112px] lg:px-32">
						<Reveal>
							<div className="mx-auto flex max-w-3xl flex-col items-center text-center">
								<p className={eyebrow}>Get started</p>
								<h2
									className="mt-16 font-fraktion text-heading font-semibold text-obsidian sm:text-display"
									id="cta-title"
								>
									Your first 10 customers are one URL away.
								</h2>
								<p className="mt-24 max-w-xl text-body text-iron">
									Paste your domain and watch the swarm hunt, verify, and hand
									you a shortlist with receipts — free while in beta.
								</p>
								<div className="mt-40 flex flex-wrap items-center justify-center gap-16">
									<Link
										className="rounded-sm bg-glacier-tint px-24 py-16 text-body-sm font-semibold text-obsidian shadow-sm transition-transform duration-[160ms] ease-out-strong hover:shadow-sm-2 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
										href="/app"
									>
										Find my customers
									</Link>
									<a
										className="px-8 py-8 text-body-sm font-semibold text-iron hover:text-obsidian hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
										href="#how-it-works"
									>
										See how it works
									</a>
								</div>
							</div>
						</Reveal>
					</div>
				</section>
			</div>
		</main>
	);
}
