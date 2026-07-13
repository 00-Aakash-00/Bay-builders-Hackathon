import { getRun, registerRadarRunner } from "@/lib/run-store";
import type { Lead } from "@/lib/schemas";
import {
	appendEngineEvent,
	type HuntContext,
	persistRunState,
	runConveyorHunt,
	storedConfirmedHunt,
} from "./hunt";
import { getTavilyBudget } from "./tools/tavily";

const activeTicks = new Map<string, Promise<Lead | undefined>>();

export function runRealRadarTick(runId: string): Promise<Lead | undefined> {
	const existing = activeTicks.get(runId);
	if (existing) return existing;

	const promise = (async () => {
		const run = getRun(runId);
		if (run?.state !== "REVIEW" && run?.state !== "RADAR") {
			return undefined;
		}
		const stored = storedConfirmedHunt(runId);
		const firstPack = stored?.plan.packs[0];
		if (!stored || !firstPack) {
			throw new Error(`Run ${runId} has no stored radar strategy`);
		}
		const context: HuntContext = {
			runId,
			domain: run.domain,
			depth: run.depth,
			quota: 1,
			radar: true,
			lastBudgetSpent: getTavilyBudget(runId).spent,
		};
		await runConveyorHunt(context, stored.icp, {
			...stored.plan,
			packs: [firstPack],
		});
		const currentState = getRun(runId)?.state;
		if (currentState !== "REVIEW" && currentState !== "RADAR") {
			return context.acceptedLead;
		}
		appendEngineEvent(runId, {
			lane: "system",
			type: "stage_change",
			payload: { state: "RADAR", domain: run.domain },
		});
		await persistRunState(context);
		return context.acceptedLead;
	})().finally(() => {
		activeTicks.delete(runId);
	});
	activeTicks.set(runId, promise);
	return promise;
}

export function registerRealRadar(runId: string): void {
	registerRadarRunner(runId, () => runRealRadarTick(runId));
}
