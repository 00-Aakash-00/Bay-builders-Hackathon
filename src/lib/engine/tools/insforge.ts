import type { Lead } from "../../schemas";

const MIGRATION = {
	version: "20260713000100",
	name: "create-customerzero-run-tables",
	sql: `
CREATE TABLE IF NOT EXISTS runs (
	id TEXT PRIMARY KEY,
	domain TEXT NOT NULL,
	depth INTEGER NOT NULL,
	state TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL,
	updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS evidence (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	run_id TEXT NOT NULL,
	signal_hash TEXT NOT NULL,
	url TEXT NOT NULL,
	quote TEXT NOT NULL,
	fetched_at TIMESTAMPTZ NOT NULL,
	quote_match_score DOUBLE PRECISION NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	CONSTRAINT evidence_run_signal_key UNIQUE (run_id, signal_hash)
);
CREATE TABLE IF NOT EXISTS leads (
	id TEXT PRIMARY KEY,
	run_id TEXT NOT NULL,
	name TEXT NOT NULL,
	lead_type TEXT NOT NULL,
	signal_hash TEXT NOT NULL,
	signal JSONB NOT NULL,
	score JSONB NOT NULL,
	enrichment JSONB NOT NULL,
	why_fit TEXT NOT NULL,
	why_now TEXT NOT NULL,
	caution TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	CONSTRAINT leads_run_signal_key UNIQUE (run_id, signal_hash),
	CONSTRAINT leads_evidence_key FOREIGN KEY (run_id, signal_hash)
		REFERENCES evidence (run_id, signal_hash)
);`,
} as const;

interface InsForgeConfig {
	apiKey: string;
	baseUrl: string;
}

interface RunUpsert {
	id: string;
	domain: string;
	depth: number;
	state: string;
	createdAt: string;
}

let warnedMissingConfig = false;
let ensurePromise: Promise<void> | undefined;

function getConfig(): InsForgeConfig | undefined {
	const apiKey = process.env.INSFORGE_API_KEY?.trim();
	const baseUrl = process.env.INSFORGE_BASE_URL?.trim().replace(/\/$/u, "");
	if (apiKey && baseUrl) {
		return { apiKey, baseUrl };
	}

	if (!warnedMissingConfig) {
		warnedMissingConfig = true;
		console.warn(
			"[InsForge] INSFORGE_API_KEY and INSFORGE_BASE_URL are required; persistence is disabled.",
		);
	}
	return undefined;
}

async function assertSuccess(
	response: Response,
	action: string,
): Promise<void> {
	if (response.ok) {
		return;
	}

	const detail = (await response.text().catch(() => "")).slice(0, 300);
	throw new Error(
		`InsForge ${action} failed (${response.status})${detail ? `: ${detail}` : ""}`,
	);
}

async function upsert(
	table: string,
	row: Record<string, unknown>,
): Promise<void> {
	await ensureInsForgeTables();
	const config = getConfig();
	if (!config) {
		return;
	}

	const conflictTarget = ["leads", "evidence"].includes(table)
		? "?on_conflict=run_id%2Csignal_hash"
		: "";
	const response = await fetch(
		`${config.baseUrl}/api/database/records/${table}${conflictTarget}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Prefer: "resolution=merge-duplicates",
				"X-API-Key": config.apiKey,
			},
			body: JSON.stringify([row]),
			signal: AbortSignal.timeout(15_000),
		},
	);
	await assertSuccess(response, `upsert into ${table}`);
}

export async function ensureInsForgeTables(): Promise<void> {
	const config = getConfig();
	if (!config) {
		return;
	}

	ensurePromise ??= (async () => {
		const response = await fetch(`${config.baseUrl}/api/database/migrations`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-API-Key": config.apiKey,
			},
			body: JSON.stringify(MIGRATION),
			signal: AbortSignal.timeout(15_000),
		});
		if (response.status === 409) {
			const listResponse = await fetch(
				`${config.baseUrl}/api/database/migrations`,
				{
					headers: { "X-API-Key": config.apiKey },
					signal: AbortSignal.timeout(15_000),
				},
			);
			await assertSuccess(listResponse, "list schema migrations");
			const payload = (await listResponse.json()) as {
				migrations?: Array<{ version?: string; name?: string }>;
			};
			if (
				payload.migrations?.some(
					(migration) =>
						migration.version === MIGRATION.version &&
						migration.name === MIGRATION.name,
				)
			) {
				return;
			}
			throw new Error(
				"InsForge rejected the migration version before CustomerZero tables were confirmed",
			);
		}
		await assertSuccess(response, "schema migration");
	})();

	try {
		await ensurePromise;
	} catch (error) {
		ensurePromise = undefined;
		throw error;
	}
}

export async function upsertRun(run: RunUpsert): Promise<void> {
	await upsert("runs", {
		id: run.id,
		domain: run.domain,
		depth: run.depth,
		state: run.state,
		created_at: run.createdAt,
		updated_at: new Date().toISOString(),
	});
}

export async function upsertVerifiedLead(
	lead: Lead,
	evidence: { fetchedAt: string; quoteMatchScore: number },
): Promise<void> {
	await upsert("evidence", {
		run_id: lead.runId,
		signal_hash: lead.signal.hash,
		url: lead.signal.url,
		quote: lead.signal.quote,
		fetched_at: evidence.fetchedAt,
		quote_match_score: evidence.quoteMatchScore,
	});
	await upsert("leads", {
		id: lead.id,
		run_id: lead.runId,
		name: lead.name,
		lead_type: lead.type,
		signal_hash: lead.signal.hash,
		signal: lead.signal,
		score: lead.score,
		enrichment: lead.enrichment,
		why_fit: lead.whyFit,
		why_now: lead.whyNow,
		caution: lead.caution ?? null,
	});
}
