import Image from "next/image";
import Link from "next/link";
import { DitherPhoto } from "@/components/marketing/dither-photo";

const navigation = [
	{ href: "#how-it-works", label: "How it works" },
	{ href: "#receipts", label: "Receipts" },
	{ href: "#get-started", label: "Get started" },
];

export default function MarketingLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<>
			<header className="fixed inset-x-0 top-0 z-50 px-16 pt-16 sm:px-24 sm:pt-24 lg:px-32">
				<a
					className="sr-only focus:not-sr-only focus:absolute focus:top-24 focus:left-24 focus:z-50 focus:rounded-sm focus:bg-white focus:px-16 focus:py-8 focus:text-body-sm focus:font-semibold focus:text-obsidian focus:shadow-sm-2 focus:outline-2 focus:outline-offset-2 focus:outline-obsidian"
					href="#main-content"
				>
					Skip to content
				</a>
				<nav
					aria-label="Primary navigation"
					className="mx-auto flex h-56 w-full max-w-7xl items-center justify-between gap-16 rounded-sm border border-mist bg-paper/80 pl-16 pr-8 shadow-sm-2 backdrop-blur-md sm:pl-24 sm:pr-16"
				>
					<Link
						className="flex items-center gap-8 font-fraktion text-subheading font-semibold text-obsidian transition-opacity duration-[160ms] ease-out-strong hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
						href="/"
					>
						<Image
							alt=""
							className="size-32"
							height={32}
							priority
							src="/brand/logo.png"
							width={32}
						/>
						CustomerZero
					</Link>

					<div className="flex items-center gap-8 sm:gap-16">
						<div className="hidden items-center gap-24 md:flex">
							{navigation.map((item) => (
								<a
									className="text-body-sm text-iron transition-colors duration-[160ms] ease-out-strong hover:text-obsidian focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
									href={item.href}
									key={item.href}
								>
									{item.label}
								</a>
							))}
						</div>

						<Link
							className="whitespace-nowrap rounded-sm bg-glacier-tint px-16 py-8 text-body-sm font-semibold text-obsidian shadow-sm transition-transform duration-[160ms] ease-out-strong hover:shadow-sm-2 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
							href="/app"
						>
							Open the app
						</Link>
					</div>
				</nav>
			</header>

			{children}

			<footer className="relative overflow-hidden border-t border-mist bg-obsidian">
				<div aria-hidden="true" className="absolute inset-0">
					<DitherPhoto
						className="h-full w-full"
						image="/brand/signal.webp"
						inverted={false}
					/>
				</div>
				<div
					aria-hidden="true"
					className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/85 to-obsidian/70"
				/>
				<div className="relative mx-auto flex w-full max-w-7xl flex-col gap-24 px-16 py-56 sm:px-24 md:flex-row md:items-end md:justify-between md:py-72 lg:px-32">
					<Link
						className="flex items-center gap-8 font-fraktion text-subheading font-semibold text-white transition-opacity duration-[160ms] ease-out-strong hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
						href="/"
					>
						<Image
							alt=""
							className="size-40"
							height={40}
							src="/brand/logo.png"
							width={40}
						/>
						CustomerZero
					</Link>
					<p className="max-w-3xl text-body-sm text-ash md:text-right">
						Built at Bay Builders Hackathon on InsForge · BAND · Kylon · Nimble
						· HydraDB · Tavily · You.com.
					</p>
				</div>
			</footer>
		</>
	);
}
