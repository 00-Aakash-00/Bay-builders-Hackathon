import { getRun, registerRadarRunner } from "@/lib/run-store";
import type { Lead, QueryPack } from "@/lib/schemas";
import { runRadarRound } from "./orchestrator";

const activeTicks = new Map<string, Promise<Lead | undefined>>();

function storedQueryPack(runId: string): QueryPack | undefined {
	const run = getRun(runId);
	for (let index = (run?.events.length ?? 0) - 1; index >= 0; index -= 1) {
		const event = run?.events[index];
		if (event?.type === "stage_change" && event.payload.queryPlan) {
			return event.payload.queryPlan.packs[0];
		}
	}
	return undefined;
}

export function runRealRadarTick(runId: string): Promise<Lead | undefined> {
	const existing = activeTicks.get(runId);
	if (existing) return existing;

	const promise = (async () => {
		const run = getRun(runId);
		if (run?.state !== "REVIEW" && run?.state !== "RADAR") {
			return undefined;
		}
		const queryPack = storedQueryPack(runId);
		if (!queryPack) {
			throw new Error(`Run ${runId} has no stored radar query pack`);
		}
		return runRadarRound(runId, queryPack);
	})().finally(() => {
		activeTicks.delete(runId);
	});
	activeTicks.set(runId, promise);
	return promise;
}

export function registerRealRadar(runId: string): void {
	registerRadarRunner(runId, () => runRealRadarTick(runId));
}
