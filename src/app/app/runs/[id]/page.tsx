import Link from "next/link";
import { RunDashboard } from "@/components/app/run-dashboard";
import { getRun } from "@/lib/run-store";

export default async function RunPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const run = getRun(id);

	if (!run) {
		return (
			<main className="flex flex-1 items-center justify-center px-16 py-48 sm:px-24">
				<section className="w-full max-w-xl rounded-sm border border-mist bg-white p-24 shadow-sm sm:p-40">
					<p className="mb-8 text-caption uppercase tracking-widest text-steel">
						Run unavailable
					</p>
					<h1 className="font-fraktion text-heading">This run is not here.</h1>
					<p className="mt-8 text-body-sm text-iron">
						It may have expired from the in-memory demo store. Start another run
						to continue.
					</p>
					<Link
						href="/app"
						className="mt-24 inline-flex rounded-sm bg-glacier-tint px-16 py-16 text-body-sm font-medium text-obsidian transition-transform duration-150 ease-out-strong active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
					>
						Create a run
					</Link>
				</section>
			</main>
		);
	}

	return (
		<RunDashboard
			runId={run.id}
			initialDomain={run.domain}
			initialState={run.state}
			createdAt={run.createdAt}
			initialBudget={run.budget}
		/>
	);
}
