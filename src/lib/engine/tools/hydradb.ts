import type { Lead } from "../../schemas";

const HYDRA_BASE_URL = "https://api.hydradb.com";
const DATABASE = "customerzero";
const localMemories = new Map<string, Set<string>>();

let warned = false;

function warnOnce(message: string): void {
	if (warned) {
		return;
	}
	warned = true;
	console.warn(`[HydraDB] ${message}`);
}

function normalize(value: string): string {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

function isSimilar(left: string, right: string): boolean {
	const normalizedLeft = normalize(left);
	const normalizedRight = normalize(right);
	if (!normalizedLeft || !normalizedRight) {
		return false;
	}
	if (normalizedLeft === normalizedRight) {
		return true;
	}
	return (
		Math.min(normalizedLeft.length, normalizedRight.length) >= 4 &&
		(normalizedLeft.includes(normalizedRight) ||
			normalizedRight.includes(normalizedLeft))
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function leadEntitySummary(lead: Lead): string {
	return [
		`Name: ${lead.name}`,
		`Type: ${lead.type}`,
		lead.enrichment.company ? `Company: ${lead.enrichment.company}` : undefined,
		lead.enrichment.role ? `Role: ${lead.enrichment.role}` : undefined,
		lead.signal.authorDisplay
			? `Author: ${lead.signal.authorDisplay}`
			: undefined,
		lead.signal.authorHandle
			? `Handle: ${lead.signal.authorHandle}`
			: undefined,
	]
		.filter((value): value is string => Boolean(value))
		.join(" | ");
}

function rememberLocally(runId: string, summary: string): void {
	const memories = localMemories.get(runId) ?? new Set<string>();
	memories.add(summary);
	localMemories.set(runId, memories);
}

function hasLocalDuplicate(runId: string, entitySummary: string): boolean {
	return [...(localMemories.get(runId) ?? [])].some((memory) =>
		isSimilar(memory, entitySummary),
	);
}

function hydraHeaders(apiKey: string): Record<string, string> {
	return {
		"API-Version": "2",
		Authorization: `Bearer ${apiKey}`,
	};
}

export async function recallDuplicate(
	runId: string,
	entitySummary: string,
): Promise<boolean> {
	if (hasLocalDuplicate(runId, entitySummary)) {
		return true;
	}

	const apiKey = process.env.HYDRA_DB_API_KEY?.trim();
	if (!apiKey) {
		warnOnce("HYDRA_DB_API_KEY is missing; using in-memory deduplication.");
		return false;
	}

	try {
		const response = await fetch(`${HYDRA_BASE_URL}/query`, {
			method: "POST",
			headers: {
				...hydraHeaders(apiKey),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				database: DATABASE,
				collection: runId,
				query: entitySummary,
				type: "memory",
				query_by: "hybrid",
				mode: "fast",
				max_results: 5,
				graph_context: false,
			}),
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) {
			warnOnce(
				`query failed (${response.status}); using in-memory deduplication.`,
			);
			return false;
		}

		const payload: unknown = await response.json();
		if (
			!isRecord(payload) ||
			payload.success !== true ||
			!isRecord(payload.data) ||
			!Array.isArray(payload.data.chunks)
		) {
			warnOnce(
				"query returned a malformed response; using in-memory deduplication.",
			);
			return false;
		}

		return payload.data.chunks.some((chunk) => {
			if (!isRecord(chunk)) {
				return false;
			}
			const candidates = [chunk.chunk_content, chunk.source_title];
			if (isRecord(chunk.additional_metadata)) {
				candidates.push(chunk.additional_metadata.entity_summary);
			}
			return candidates.some(
				(candidate) =>
					typeof candidate === "string" && isSimilar(candidate, entitySummary),
			);
		});
	} catch {
		warnOnce("query failed; using in-memory deduplication.");
		return false;
	}
}

export async function addVerifiedLeadMemory(
	runId: string,
	lead: Lead,
): Promise<void> {
	const summary = leadEntitySummary(lead);
	const memoryText = [
		summary,
		`Quote: ${lead.signal.quote}`,
		`Source: ${lead.signal.url}`,
	].join(" | ");
	rememberLocally(runId, summary);

	const apiKey = process.env.HYDRA_DB_API_KEY?.trim();
	if (!apiKey) {
		warnOnce(
			"HYDRA_DB_API_KEY is missing; retaining verified leads in memory only.",
		);
		return;
	}

	const body = new FormData();
	body.set("type", "memory");
	body.set("database", DATABASE);
	body.set("collection", runId);
	body.set("upsert", "true");
	body.set(
		"memories",
		JSON.stringify([
			{
				id: lead.id,
				title: lead.name,
				text: memoryText,
				infer: false,
				additional_metadata: JSON.stringify({
					entity_summary: summary,
					lead_id: lead.id,
					run_id: runId,
					signal_hash: lead.signal.hash,
				}),
			},
		]),
	);

	try {
		const response = await fetch(`${HYDRA_BASE_URL}/context/ingest`, {
			method: "POST",
			headers: hydraHeaders(apiKey),
			body,
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) {
			warnOnce(
				`ingest failed (${response.status}); retaining the local memory.`,
			);
			return;
		}

		const payload: unknown = await response.json();
		if (!isRecord(payload) || payload.success !== true) {
			warnOnce(
				"ingest returned a malformed response; retaining the local memory.",
			);
		}
	} catch {
		warnOnce("ingest failed; retaining the local memory.");
	}
}
