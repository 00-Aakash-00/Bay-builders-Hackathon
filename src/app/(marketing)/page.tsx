import type { Metadata } from "next";
import Link from "next/link";
import { HeroImage } from "@/components/marketing/hero-image";
import { HeroWorld } from "@/components/marketing/hero-world";
import { LeadCard } from "@/components/marketing/lead-card";
import styles from "@/components/marketing/marketing.module.css";
import { Reveal } from "@/components/marketing/reveal";

const heroDescription =
	"Paste your domain. An agent swarm hunts live pain signals across the web, verifies every source, and drafts outreach you send from your own Gmail.";

export const metadata: Metadata = {
	title: "CustomerZero — your first 10 customers, with receipts",
	description: heroDescription,
};

const contrasts = [
	{
		title: "Sales databases",
		body: "Who matches a filter — never who has the pain this week.",
	},
	{
		title: "AI SDRs",
		body: "Volume spray, collapsing reply rates, and a sender nobody trusts.",
	},
	{
		title: "CustomerZero",
		body: "10 verified people with receipts, sent by you.",
	},
];

const steps = [
	{
		number: "①",
		title: "Paste your domain",
		body: "Your live site becomes the product brief.",
	},
	{
		number: "②",
		title: "Confirm your ICP (60 seconds)",
		body: "Pick or edit one focused hypothesis.",
	},
	{
		number: "③",
		title: "The swarm hunts — and kills anything it can’t prove",
		body: "Every lead carries a quote, a link, a timestamp.",
	},
	{
		number: "④",
		title: "Approve; it sends from your Gmail",
		body: "Every draft stays in your hands.",
	},
];

const radarRows = [
	{ lane: "reddit", event: "pain signal found in r/startups", time: "now" },
	{ lane: "verifier", event: "quote matched · source current", time: "+04s" },
	{ lane: "github", event: "new issue fits the winning ICP", time: "+11s" },
	{ lane: "radar", event: "verified lead added to shortlist", time: "+16s" },
];

const pricingPlans = [
	{
		name: "The run",
		price: "Free while in beta",
		bullets: [
			"One domain-to-shortlist run",
			"10 verified leads with receipts",
			"Founder-voice drafts you approve",
		],
		cta: "Find my customers",
		primary: true,
	},
	{
		name: "The radar",
		price: "$49/mo",
		bullets: [
			"A standing monitor from winning queries",
			"New verified signals as they appear",
			"In-app, BAND, and Gmail alerts",
		],
		cta: "Open the app",
		primary: false,
	},
];

export default function MarketingPage() {
	return (
		<main
			className="scroll-mt-80 flex-1 bg-paper text-obsidian"
			id="main-content"
			tabIndex={-1}
		>
			<section aria-labelledby="hero-title" className="border-b border-mist">
				<div className="mx-auto grid w-full max-w-7xl gap-48 px-16 py-56 sm:px-24 md:py-72 lg:grid-cols-2 lg:items-center lg:px-32">
					<div className={styles.heroEntrance}>
						<p className="text-caption font-semibold uppercase text-iron">
							Evidence-backed founder sales
						</p>
						<h1
							className="mt-16 max-w-2xl font-fraktion text-display font-semibold text-obsidian"
							id="hero-title"
						>
							Your first 10 customers, with receipts.
						</h1>
						<p className="mt-24 max-w-xl text-body text-iron">
							{heroDescription}
						</p>
						<div className="mt-32 flex flex-wrap items-center gap-16">
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

					<div
						aria-hidden="true"
						className={`${styles.heroEntrance} ${styles.heroVisual} relative aspect-[4/3] overflow-hidden rounded-sm border border-mist bg-cloud shadow-sm`}
					>
						<HeroImage />
					</div>
				</div>
			</section>

			<section aria-label="Evidence flight" className="border-b border-mist">
				<HeroWorld />
			</section>

			<section
				aria-labelledby="dead-zone-title"
				className="border-b border-mist"
			>
				<div className="mx-auto w-full max-w-7xl px-16 py-72 sm:px-24 md:py-80 lg:px-32">
					<Reveal>
						<p className="text-caption font-semibold uppercase text-iron">
							The dead zone
						</p>
						<h2
							className="mt-16 max-w-2xl font-fraktion text-heading font-semibold text-obsidian"
							id="dead-zone-title"
						>
							Pre-seed founders don’t need more rows. They need proof of pain.
						</h2>
					</Reveal>

					<div className="mt-40 grid border-y border-mist md:grid-cols-3">
						{contrasts.map((item, index) => (
							<Reveal className="h-full" delay={index * 50} key={item.title}>
								<div
									className={`h-full p-24 ${index === 0 ? "" : "border-t border-mist md:border-t-0 md:border-l"}`}
								>
									<h3 className="font-fraktion text-subheading font-semibold text-obsidian">
										{item.title}
									</h3>
									<p className="mt-16 text-body-sm text-iron">{item.body}</p>
								</div>
							</Reveal>
						))}
					</div>
				</div>
			</section>

			<section
				aria-labelledby="how-it-works-title"
				className="scroll-mt-80 border-b border-mist"
				id="how-it-works"
			>
				<div className="mx-auto w-full max-w-7xl px-16 py-72 sm:px-24 md:py-80 lg:px-32">
					<Reveal>
						<p className="text-caption font-semibold uppercase text-iron">
							How it works
						</p>
						<h2
							className="mt-16 max-w-2xl font-fraktion text-heading font-semibold text-obsidian"
							id="how-it-works-title"
						>
							One brief. One human gate. Then the swarm goes hunting.
						</h2>
					</Reveal>

					<div className="mt-40 grid border-y border-mist lg:grid-cols-4">
						{steps.map((step, index) => (
							<Reveal className="h-full" delay={index * 50} key={step.number}>
								<article
									className={`h-full p-24 ${index === 0 ? "" : "border-t border-mist lg:border-t-0 lg:border-l"}`}
								>
									<p
										aria-hidden="true"
										className="font-fraktion text-heading text-steel"
									>
										{step.number}
									</p>
									<h3 className="mt-24 text-subheading font-semibold text-obsidian">
										{step.title}
									</h3>
									<p className="mt-16 text-body-sm text-iron">{step.body}</p>
								</article>
							</Reveal>
						))}
					</div>
				</div>
			</section>

			<section
				aria-labelledby="receipts-title"
				className="scroll-mt-80 border-b border-mist"
				id="receipts"
			>
				<div className="mx-auto w-full max-w-7xl px-16 py-72 sm:px-24 md:py-80 lg:px-32">
					<Reveal>
						<div className="grid gap-24 lg:grid-cols-2 lg:items-end">
							<div>
								<p className="text-caption font-semibold uppercase text-iron">
									Receipts
								</p>
								<h2
									className="mt-16 font-fraktion text-heading font-semibold text-obsidian"
									id="receipts-title"
								>
									Evidence or it doesn’t exist.
								</h2>
							</div>
							<p className="max-w-xl text-body text-iron lg:justify-self-end">
								An adversarial verifier re-fetches every source. Leads that fail
								die before you ever see them.
							</p>
						</div>
					</Reveal>

					<div className="mt-40 grid gap-24 lg:grid-cols-2">
						<Reveal className="h-full">
							<LeadCard
								company="Pylonworks"
								date="July 11, 2026"
								dateTime="2026-07-11"
								name="Rina Patel"
								persona="Head of Customer Success"
								quote="We lose the why behind customer requests between calls and the roadmap. I need the evidence attached."
								score="82"
								source="github.com/pylonworks/feedback/issues/184"
								stage="problem aware"
							/>
						</Reveal>
						<Reveal className="h-full" delay={50}>
							<LeadCard
								company="RelayDesk"
								date="July 9, 2026"
								dateTime="2026-07-09"
								name="Tom Becker"
								persona="Founder"
								quote="Looking for a better way to find early design partners this month."
								rejected
								score="—"
								source="reddit.com/r/SaaS/comments/1m2cq9"
								stage="trigger present"
							/>
						</Reveal>
					</div>
				</div>
			</section>

			<section aria-labelledby="radar-title" className="border-b border-mist">
				<div className="mx-auto grid w-full max-w-7xl gap-40 px-16 py-72 sm:px-24 md:py-80 lg:grid-cols-2 lg:items-center lg:px-32">
					<Reveal>
						<p className="text-caption font-semibold uppercase text-iron">
							Standing radar
						</p>
						<h2
							className="mt-16 max-w-xl font-fraktion text-heading font-semibold text-obsidian"
							id="radar-title"
						>
							Ten now. The next hundred on radar.
						</h2>
						<p className="mt-24 max-w-xl text-body text-iron">
							The run finds your first ten; the standing radar streams the next
							hundred. It reuses the winning queries and only surfaces new
							signals that survive the same verifier.
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

			<section
				aria-labelledby="pricing-title"
				className="scroll-mt-80"
				id="pricing"
			>
				<div className="mx-auto w-full max-w-7xl px-16 py-72 sm:px-24 md:py-80 lg:px-32">
					<Reveal>
						<p className="text-caption font-semibold uppercase text-iron">
							Pricing
						</p>
						<h2
							className="mt-16 max-w-2xl font-fraktion text-heading font-semibold text-obsidian"
							id="pricing-title"
						>
							Start with the run. Keep the radar on.
						</h2>
					</Reveal>

					<div className="mt-40 grid gap-24 lg:grid-cols-2">
						{pricingPlans.map((plan, index) => (
							<Reveal className="h-full" delay={index * 50} key={plan.name}>
								<article className="flex h-full flex-col rounded-sm border border-mist bg-white p-32 shadow-sm">
									<h3 className="font-fraktion text-subheading font-semibold text-obsidian">
										{plan.name}
									</h3>
									<p className="mt-16 text-heading font-semibold text-obsidian">
										{plan.price}
									</p>
									<ul className="mt-32 flex flex-col gap-16 text-body-sm text-iron">
										{plan.bullets.map((bullet) => (
											<li className="flex gap-8" key={bullet}>
												<span aria-hidden="true">—</span>
												<span>{bullet}</span>
											</li>
										))}
									</ul>
									<div className="mt-auto pt-32">
										<Link
											className={
												plan.primary
													? "inline-flex rounded-sm bg-glacier-tint px-24 py-16 text-body-sm font-semibold text-obsidian shadow-sm transition-transform duration-[160ms] ease-out-strong hover:shadow-sm-2 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
													: "inline-flex rounded-sm border border-mist bg-white px-24 py-16 text-body-sm font-semibold text-obsidian transition-transform duration-[160ms] ease-out-strong hover:underline active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
											}
											href="/app"
										>
											{plan.cta}
										</Link>
									</div>
								</article>
							</Reveal>
						))}
					</div>
				</div>
			</section>
		</main>
	);
}
