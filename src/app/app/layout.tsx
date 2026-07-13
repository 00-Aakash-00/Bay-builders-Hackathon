import Link from "next/link";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-full flex-1 flex-col bg-paper text-obsidian">
			<header className="border-mist border-b bg-white">
				<div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between gap-16 px-16 py-16 sm:px-24">
					<Link
						href="/"
						className="font-fraktion text-subheading tracking-tight text-obsidian"
					>
						CustomerZero
					</Link>
					<p className="text-right text-caption text-steel">
						runs are hypotheses, not customers
					</p>
				</div>
			</header>
			{children}
		</div>
	);
}
