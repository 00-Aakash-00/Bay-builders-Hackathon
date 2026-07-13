import Link from "next/link";
import { RunDashboard } from "@/components/app/run-dashboard";
import type { RunRecord } from "@/lib/run-store";
import { engineWorkerUrl } from "@/lib/worker-client";

type RunSnapshot = Pick<
	RunRecord,
	"id" | "domain" | "depth" | "state" | "mode" | "createdAt" | "budget"
>;

export default async function RunPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const response = await fetch(
		engineWorkerUrl(`/runs/${encodeURIComponent(id)}`),
		{ cache: "no-store" },
	);
	if (!response.ok && response.status !== 404) {
		throw new Error(`Engine worker returned ${response.status}`);
	}
	const run: RunSnapshot | undefined = response.ok
		? ((await response.json()) as RunSnapshot)
		: undefined;

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
		<>
			<div className="mx-auto w-full max-w-screen-2xl px-16 pt-24 sm:px-24">
				<Link
					href="/app"
					className="text-caption text-iron hover:text-obsidian"
				>
					← All runs
				</Link>
			</div>
			<RunDashboard
				runId={run.id}
				mode={run.mode}
				initialDomain={run.domain}
				initialState={run.state}
				createdAt={run.createdAt}
				initialBudget={run.budget}
			/>
		</>
	);
}
