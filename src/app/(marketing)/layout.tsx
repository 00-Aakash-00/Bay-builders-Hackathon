import Link from "next/link";

const navigation = [
	{ href: "#how-it-works", label: "How it works" },
	{ href: "#receipts", label: "Receipts" },
	{ href: "#pricing", label: "Pricing" },
];

export default function MarketingLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<>
			<header className="sticky top-0 z-50 border-b border-mist bg-paper/90 backdrop-blur">
				<a
					className="sr-only focus:not-sr-only focus:absolute focus:top-16 focus:left-16 focus:z-50 focus:rounded-sm focus:bg-white focus:px-16 focus:py-8 focus:text-body-sm focus:font-semibold focus:text-obsidian focus:shadow-sm-2 focus:outline-2 focus:outline-offset-2 focus:outline-obsidian"
					href="#main-content"
				>
					Skip to content
				</a>
				<nav
					aria-label="Primary navigation"
					className="mx-auto flex h-72 w-full max-w-7xl items-center justify-between gap-16 px-16 sm:px-24 lg:px-32"
				>
					<Link
						className="font-fraktion text-subheading font-semibold text-obsidian hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
						href="/"
					>
						CustomerZero
					</Link>

					<div className="flex items-center gap-24">
						<div className="hidden items-center gap-24 md:flex">
							{navigation.map((item) => (
								<a
									className="text-body-sm text-iron hover:text-obsidian focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
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

			<footer className="border-t border-mist bg-paper">
				<div className="mx-auto flex w-full max-w-7xl flex-col gap-24 px-16 py-40 sm:px-24 md:flex-row md:items-end md:justify-between md:py-48 lg:px-32">
					<Link
						className="font-fraktion text-subheading font-semibold text-obsidian hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
						href="/"
					>
						CustomerZero
					</Link>
					<p className="max-w-3xl text-body-sm text-iron md:text-right">
						Built at Bay Builders Hackathon on InsForge · BAND · Kylon · Nimble
						· HydraDB · Tavily · You.com.
					</p>
				</div>
			</footer>
		</>
	);
}
