import { driveMockRun, getRun, type RunDepth } from "@/lib/run-store";
import { appendEngineEvent, runOrchestrator } from "./orchestrator";
import { registerRealRadar } from "./radar";
import { upsertRun } from "./tools/insforge";

const activeRuns = new Set<string>();

export async function startEngineRun(
	runId: string,
	domain: string,
	depth: RunDepth,
): Promise<void> {
	if (activeRuns.has(runId)) return;
	const run = getRun(runId);
	if (!run || run.domain !== domain || run.depth !== depth) {
		throw new Error(`Run ${runId} does not match the engine request`);
	}

	activeRuns.add(runId);
	try {
		if (process.env.MOCK_MODE === "1" || !process.env.ANTHROPIC_API_KEY) {
			await driveMockRun(runId);
			return;
		}

		registerRealRadar(runId);
		await runOrchestrator({ runId, domain, depth });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Engine run failed";
		appendEngineEvent(runId, {
			lane: "system",
			type: "error",
			payload: { message, recoverable: false },
		});
		if (getRun(runId)?.state !== "FAILED") {
			appendEngineEvent(runId, {
				lane: "system",
				type: "stage_change",
				payload: { state: "FAILED", domain },
			});
		}
		const failedRun = getRun(runId);
		if (failedRun) {
			try {
				await upsertRun({
					id: failedRun.id,
					domain: failedRun.domain,
					depth: failedRun.depth,
					state: failedRun.state,
					createdAt: failedRun.createdAt,
				});
			} catch (persistError) {
				console.warn(
					`[engine] Failed run checkpoint failed for ${runId}`,
					persistError instanceof Error ? persistError.message : persistError,
				);
			}
		}
	} finally {
		activeRuns.delete(runId);
	}
}
