import { existsSync, readFileSync } from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import { URL } from "node:url";
import type { RunDepth, RunRecord } from "@/lib/run-store";

function loadLocalEnv(): void {
	const envPath = resolve(process.cwd(), ".env.local");
	if (!existsSync(envPath)) return;

	for (const sourceLine of readFileSync(envPath, "utf8").split(/\r?\n/u)) {
		const line = sourceLine.trim();
		if (!line || line.startsWith("#")) continue;

		const separator = line.indexOf("=");
		if (separator <= 0) continue;

		const key = line.slice(0, separator).trim();
		let value = line.slice(separator + 1).trim();
		const quote = value[0];
		if ((quote === '"' || quote === "'") && value.at(-1) === quote) {
			value = value.slice(1, -1);
		}

		if (process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

let append: typeof import("@/lib/run-store")["append"];
let approveLead: typeof import("@/lib/run-store")["approveLead"];
let confirmIcp: typeof import("@/lib/run-store")["confirmIcp"];
let createEngineRun: typeof import("@/lib/run-store")["createEngineRun"];
let getRun: typeof import("@/lib/run-store")["getRun"];
let listRuns: typeof import("@/lib/run-store")["listRuns"];
let subscribe: typeof import("@/lib/run-store")["subscribe"];
let triggerRadar: typeof import("@/lib/run-store")["triggerRadar"];
let startEngineRun: typeof import("@/lib/engine")["startEngineRun"];
let sendEmail: typeof import("@/lib/engine/tools/kylon")["sendEmail"];
let RunEventSchema: typeof import("@/lib/schemas")["RunEventSchema"];

const depths: RunDepth[] = [5, 10, 20];
const approvalLocks = new Map<string, Promise<void>>();

type RunSnapshot = Pick<
	RunRecord,
	"id" | "domain" | "depth" | "state" | "mode" | "createdAt" | "budget"
>;

interface JsonResult {
	status: number;
	body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			(url.protocol === "http:" || url.protocol === "https:") &&
			url.hostname.length > 0
		);
	} catch {
		return false;
	}
}

async function readJson(request: IncomingMessage): Promise<unknown> {
	request.setEncoding("utf8");
	let source = "";
	for await (const chunk of request as AsyncIterable<string>) {
		source += chunk;
	}

	try {
		return JSON.parse(source) as unknown;
	} catch {
		return undefined;
	}
}

function sendJson(
	response: ServerResponse,
	status: number,
	body: unknown,
): void {
	response.writeHead(status, {
		"Content-Type": "application/json; charset=utf-8",
	});
	response.end(JSON.stringify(body));
}

function parseLastEventId(request: IncomingMessage, url: URL): number {
	const header = request.headers["last-event-id"];
	const headerValue = Array.isArray(header) ? header[0] : header;
	const value = Number.parseInt(
		headerValue ?? url.searchParams.get("lastEventId") ?? "0",
		10,
	);
	return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

async function withApprovalLock<T>(
	key: string,
	task: () => Promise<T>,
): Promise<T> {
	const previous = approvalLocks.get(key) ?? Promise.resolve();
	let release = () => {};
	const current = new Promise<void>((resolveLock) => {
		release = resolveLock;
	});
	approvalLocks.set(key, current);
	await previous;
	try {
		return await task();
	} finally {
		release();
		if (approvalLocks.get(key) === current) approvalLocks.delete(key);
	}
}

async function createRun(request: IncomingMessage): Promise<JsonResult> {
	const body = await readJson(request);
	if (!isRecord(body)) {
		return { status: 400, body: { error: "Invalid request body" } };
	}

	const domain = typeof body.domain === "string" ? body.domain.trim() : "";
	const depth = body.depth ?? 10;
	if (!isHttpUrl(domain)) {
		return {
			status: 400,
			body: { error: "Domain must be a valid http(s) URL" },
		};
	}
	if (typeof depth !== "number" || !depths.includes(depth as RunDepth)) {
		return { status: 400, body: { error: "Depth must be 5, 10, or 20" } };
	}

	const runDepth = depth as RunDepth;
	const run = createEngineRun(domain, runDepth);
	void startEngineRun(run.id, domain, runDepth);
	return { status: 201, body: { id: run.id } };
}

function getRunSnapshot(id: string): JsonResult {
	const run = getRun(id);
	if (!run) {
		return { status: 404, body: { error: "Run not found" } };
	}

	const snapshot: RunSnapshot = {
		id: run.id,
		domain: run.domain,
		depth: run.depth,
		state: run.state,
		mode: run.mode,
		createdAt: run.createdAt,
		budget: run.budget,
	};
	return { status: 200, body: snapshot };
}

function streamRunEvents(
	request: IncomingMessage,
	response: ServerResponse,
	id: string,
	url: URL,
): void {
	if (!getRun(id)) {
		sendJson(response, 404, { error: "Run not found" });
		return;
	}

	response.writeHead(200, {
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"Content-Type": "text/event-stream; charset=utf-8",
		"X-Accel-Buffering": "no",
	});
	response.flushHeaders();

	const unsubscribe = subscribe(id, parseLastEventId(request, url), (event) => {
		response.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
	});
	const heartbeat = setInterval(() => {
		response.write(": heartbeat\n\n");
	}, 15_000);
	let active = true;
	const cleanup = () => {
		if (!active) return;
		active = false;
		clearInterval(heartbeat);
		unsubscribe();
	};
	response.once("close", cleanup);
}

async function confirmRunIcp(
	request: IncomingMessage,
	id: string,
): Promise<JsonResult> {
	if (!getRun(id)) {
		return { status: 404, body: { error: "Run not found" } };
	}

	const body = await readJson(request);
	if (!isRecord(body)) {
		return { status: 400, body: { error: "Invalid request body" } };
	}

	const value = body.icpId;
	const icpId = typeof value === "string" ? value.trim() : "";
	if (!icpId) {
		return { status: 400, body: { error: "icpId is required" } };
	}
	if (!confirmIcp(id, icpId)) {
		return {
			status: 409,
			body: { error: "Run is not waiting for this ICP confirmation" },
		};
	}

	return { status: 200, body: { ok: true } };
}

async function approveRunLead(
	request: IncomingMessage,
	id: string,
): Promise<JsonResult> {
	if (!getRun(id)) {
		return { status: 404, body: { error: "Run not found" } };
	}

	const body = await readJson(request);
	if (!isRecord(body)) {
		return { status: 400, body: { error: "Invalid request body" } };
	}

	const leadId = body.leadId;
	if (typeof leadId !== "string" || leadId.trim().length === 0) {
		return { status: 400, body: { error: "leadId is required" } };
	}

	return withApprovalLock(`${id}:${leadId}`, async () => {
		const currentRun = getRun(id);
		const lead = currentRun?.leads.get(leadId);
		const storedDraft = currentRun?.drafts.get(leadId);
		if (!currentRun || !lead || !storedDraft) {
			return { status: 404, body: { error: "Lead draft not found" } };
		}
		if (storedDraft.status === "sent") {
			return {
				status: 200,
				body: { ok: true, status: storedDraft.status },
			};
		}

		const publicEmail =
			lead.enrichment.contacts?.find(
				(contact) => contact.kind === "public_email",
			)?.value ??
			(lead.enrichment.channel.kind === "public_email"
				? lead.enrichment.channel.value
				: undefined);
		const sendResult = await sendEmail({
			...(publicEmail ? { to: publicEmail } : {}),
			body: storedDraft.body,
			...(storedDraft.subject ? { subject: storedDraft.subject } : {}),
		});
		const event = RunEventSchema.parse({
			runId: id,
			ts: new Date().toISOString(),
			seq: (currentRun.events.at(-1)?.seq ?? 0) + 1,
			lane: "composer",
			type: sendResult.successful ? "tool_call" : "error",
			payload: sendResult.successful
				? {
						tool: "kylon_send_email",
						action: sendResult.simulated
							? `Simulated approved send for ${leadId}`
							: `Sent email for ${leadId}`,
					}
				: {
						message: sendResult.error ?? "Kylon email send failed",
						recoverable: true,
					},
		});
		append(id, event);
		if (!sendResult.successful) {
			return {
				status: publicEmail ? 502 : 422,
				body: { error: sendResult.error ?? "Email send failed" },
			};
		}

		const draft = approveLead(id, leadId);
		if (!draft) {
			return { status: 404, body: { error: "Lead draft not found" } };
		}

		return {
			status: 200,
			body: {
				ok: true,
				status: draft.status,
				simulated: sendResult.simulated,
			},
		};
	});
}

function triggerRunRadar(id: string): JsonResult {
	if (!getRun(id)) {
		return { status: 404, body: { error: "Run not found" } };
	}

	const lead = triggerRadar(id);
	return { status: 200, body: { ok: true, leadId: lead?.id } };
}

async function handleRequest(
	request: IncomingMessage,
	response: ServerResponse,
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	if (request.method === "POST" && url.pathname === "/runs") {
		const result = await createRun(request);
		sendJson(response, result.status, result.body);
		return;
	}
	if (request.method === "GET" && url.pathname === "/runs") {
		sendJson(response, 200, listRuns());
		return;
	}

	const segments = url.pathname.split("/").filter(Boolean);
	const id = segments[0] === "runs" ? segments[1] : undefined;
	if (!id) {
		sendJson(response, 404, { error: "Not found" });
		return;
	}

	let result: JsonResult | undefined;
	if (request.method === "GET" && segments.length === 2) {
		result = getRunSnapshot(id);
	} else if (
		request.method === "GET" &&
		segments.length === 3 &&
		segments[2] === "events"
	) {
		streamRunEvents(request, response, id, url);
		return;
	} else if (
		request.method === "POST" &&
		segments.length === 3 &&
		segments[2] === "confirm-icp"
	) {
		result = await confirmRunIcp(request, id);
	} else if (
		request.method === "POST" &&
		segments.length === 3 &&
		segments[2] === "approve"
	) {
		result = await approveRunLead(request, id);
	} else if (
		request.method === "POST" &&
		segments.length === 4 &&
		segments[2] === "radar" &&
		segments[3] === "trigger"
	) {
		result = triggerRunRadar(id);
	}

	if (!result) {
		sendJson(response, 404, { error: "Not found" });
		return;
	}
	sendJson(response, result.status, result.body);
}

async function main(): Promise<void> {
	loadLocalEnv();
	// Engine MCP tools (save_lead, enrich_lead) run serial re-fetches and
	// upserts that can take minutes; the SDK's default per-call timeout kills
	// them and poisons the shared transport ("Stream closed").
	process.env.MCP_TOOL_TIMEOUT ??= "600000";
	process.env.MCP_TIMEOUT ??= "120000";
	const [runStore, engine, kylon, schemas] = await Promise.all([
		import("@/lib/run-store"),
		import("@/lib/engine"),
		import("@/lib/engine/tools/kylon"),
		import("@/lib/schemas"),
	]);
	({
		append,
		approveLead,
		confirmIcp,
		createEngineRun,
		getRun,
		listRuns,
		subscribe,
		triggerRadar,
	} = runStore);
	({ startEngineRun } = engine);
	({ sendEmail } = kylon);
	({ RunEventSchema } = schemas);

	const port = Number(process.env.WORKER_PORT || 8787);
	const server = createServer((request, response) => {
		void handleRequest(request, response).catch((error: unknown) => {
			console.error("[worker] Request failed", error);
			if (response.headersSent) {
				response.destroy();
				return;
			}
			sendJson(response, 500, { error: "Internal server error" });
		});
	});

	server.listen(port, process.env.WORKER_HOST ?? "127.0.0.1", () => {
		console.log(`[worker] Listening on http://127.0.0.1:${port}`);
	});
}

void main().catch((error: unknown) => {
	console.error("[worker] Startup failed", error);
	process.exitCode = 1;
});
