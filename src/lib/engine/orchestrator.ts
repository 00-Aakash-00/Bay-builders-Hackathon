import {
	type AgentDefinition,
	type AnyZodRawShape,
	createSdkMcpServer,
	query,
	type SDKMessage,
	type SDKUserMessage,
	type SdkMcpToolDefinition,
	tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getRun, type RunDepth, waitForIcpConfirmation } from "@/lib/run-store";
import {
	CandidateSignalSchema,
	LeadSchema,
	OutreachDraftSchema,
	type RunEvent,
	RunEventSchema,
} from "@/lib/schemas";
import { enrichLead } from "./enrich";
import {
	appendEngineEvent,
	emitBudget,
	extractWeb,
	finalizeVerifiedLead,
	type HuntContext,
	persistRunState,
	runConveyorHunt,
	searchWeb,
	storedConfirmedHunt,
} from "./hunt";
import { addVerifiedLeadMemory, recallDuplicate } from "./tools/hydradb";
import { ensureInsForgeTables } from "./tools/insforge";
import { getTavilyBudget, resetTavilyBudget } from "./tools/tavily";

export { appendEngineEvent } from "./hunt";

interface OrchestratorInput {
	runId: string;
	domain: string;
	depth: RunDepth;
}

interface RunContext extends HuntContext {
	agentLanes: Map<string, string>;
}

const CompletionSchema = z
	.object({
		status: z.literal("REVIEW"),
		verifiedLeadCount: z.literal(0),
	})
	.strict();

const eventPayloadReference = `EVENT PAYLOAD REFERENCE (strict JSON; no extra keys; ? = optional):
stage_change: { state: INTAKE|ICP_CONFIRM|STRATEGY|HUNTING|REVIEW|DELIVERED|RADAR|FAILED|KILLED, domain?: string, brief?: ProductBrief, icps?: ICPHypothesis[2..3] (key is "icps", never "hypotheses"), queryPlan?: QueryPlan }
agent_started: { agent: string, message: string } · tool_call: { tool: string, action: string }
signal_found: CandidateSignal { url: http(s) URL, channel: reddit|hn|x|reviews|github|jobs|forums|news, title: string, authorHandle?: string, quoteCandidate: string, publishedAt?: ISO datetime with offset, foundBy: string } · signal_rejected: { signal: CandidateSignal, reason: string }
lead_verified: Lead · lead_scored: { leadId: string, score: ScoreBreakdown } · draft_ready: { draft: OutreachDraft, status: draft|sent } · radar_alert: Lead
strategy_pivot: { rationale: string } · budget_update: { spent: number >= 0, total: number >= 0, provider?: tavily|youcom|nimble } · error: { message: string, recoverable: boolean }
ProductBrief (all fields required): { domain: string, product: string, outcome: string, buyer: string, user: string, priceMotion: string, geography: string, topUseCase: string, inferences: string[] }
ICPHypothesis (all fields required): { id: string, persona: string, industry: string, companySize: string, painTriggers: string[1..], positiveSignals: string[1..], disqualifiers: string[] (may be []), vocabulary: string[1..] }
QueryPlan: { icpId: string, packs: { bucket: demand|pain|workaround|switching|timing, channel: reddit|hn|x|reviews|github|jobs|forums|news, provider: tavily|youcom|nimble, queries: string[1..] }[1..], budget: { providers: { provider: tavily|youcom|nimble, allocated: number >= 0 }[1..] } }
ScoreBreakdown: { pain: 0..5, fit: 0..5, timing: 0..5, reachability: 0..5, evidenceQuality: 0..5, total: 0..100, stage: high_intent|problem_aware|trigger_present }
OutreachDraft: { leadId: string, channel: string, subject?: string, body: string (1..90 words), groundedIn: http(s) URL[1..] }
emit_event accepts only stage_change|agent_started|tool_call|signal_found|signal_rejected|strategy_pivot|error. save_lead/system code emits lead_verified|lead_scored|draft_ready|radar_alert|budget_update.`;

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function shortText(value: string, fallback: string): string {
	const normalized = value.replace(/\s+/gu, " ").trim();
	return (normalized || fallback).slice(0, 220);
}

function jsonResult(value: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value) }],
	};
}

function assertValidStageChange(
	context: RunContext,
	event: Extract<RunEvent, { type: "stage_change" }>,
): void {
	const run = getRun(context.runId);
	if (!run) throw new Error(`Unknown run: ${context.runId}`);
	const { state } = event.payload;

	if (state === "INTAKE") {
		if (
			run.state !== "INTAKE" ||
			run.selectedIcpId ||
			event.payload.domain !== context.domain ||
			!event.payload.brief
		) {
			throw new Error("INTAKE requires the submitted domain and ProductBrief");
		}
		return;
	}
	if (state === "ICP_CONFIRM") {
		const ids = event.payload.icps?.map((icp) => icp.id) ?? [];
		if (
			run.state !== "INTAKE" ||
			event.payload.domain !== context.domain ||
			!event.payload.brief ||
			ids.length < 2 ||
			new Set(ids).size !== ids.length
		) {
			throw new Error(
				"ICP_CONFIRM requires a ProductBrief and 2-3 uniquely identified hypotheses",
			);
		}
		return;
	}
	if (state === "STRATEGY") {
		if (
			run.state !== "ICP_CONFIRM" ||
			!run.selectedIcpId ||
			event.payload.queryPlan?.icpId !== run.selectedIcpId
		) {
			throw new Error("STRATEGY requires the founder-confirmed ICP query plan");
		}
		return;
	}
	if (state === "HUNTING") {
		if (
			run.state !== "STRATEGY" ||
			!run.selectedIcpId ||
			event.payload.queryPlan?.icpId !== run.selectedIcpId
		) {
			throw new Error("HUNTING requires the active confirmed-ICP query plan");
		}
		return;
	}
	if (state === "REVIEW") {
		if (run.state !== "HUNTING" || !run.selectedIcpId) {
			throw new Error("REVIEW requires a completed confirmed-ICP hunt");
		}
		return;
	}

	throw new Error(`The orchestrator cannot emit stage ${state}`);
}

function createTools(context: RunContext) {
	const providerSchema = z.enum(["tavily", "youcom", "nimble"]);
	const saveLeadExample = JSON.stringify({
		id: "lead-1",
		runId: context.runId,
		name: "Ari Chen",
		type: "person",
		signal: {
			url: "https://example.com/thread/1",
			channel: "forums",
			quote: "Manual intake costs us hours every week.",
			publishedAt: "2026-07-01T12:00:00Z",
			sourceType: "forum_post",
			hash: "0".repeat(64),
		},
		score: {
			pain: 4,
			fit: 4,
			timing: 4,
			reachability: 4,
			evidenceQuality: 4,
			total: 80,
			stage: "problem_aware",
		},
		enrichment: {
			channel: {
				kind: "thread_reply",
				value: "Reply in source thread",
				provenanceUrl: "https://example.com/thread/1",
			},
			reachabilityConfidence: "high",
		},
		whyFit: "Matches the confirmed ICP.",
		whyNow: "They described a current recurring problem.",
	});
	return [
		tool(
			"web_search",
			"Search the public web. Results may be synthetic and are clearly labeled when a provider key is absent.",
			{
				query: z.string().min(1),
				provider: providerSchema.optional(),
				maxResults: z.number().int().min(1).max(10).optional(),
			},
			async (args) =>
				jsonResult(
					await searchWeb(context, args.query, args.provider, args.maxResults),
				),
		),
		tool(
			"web_extract",
			"Fetch public page content. The verifier must use this before proposing a lead.",
			{
				urls: z.array(z.string().url()).min(1).max(5),
				provider: z.enum(["tavily", "nimble"]).optional(),
			},
			async (args) =>
				jsonResult(await extractWeb(context, args.urls, args.provider)),
		),
		tool(
			"memory_recall",
			"Check whether an entity or signal was already seen in this run.",
			{ entitySummary: z.string().min(1) },
			async ({ entitySummary: summary }) =>
				jsonResult({
					duplicate: await recallDuplicate(context.runId, summary),
				}),
		),
		tool(
			"memory_add",
			"Store a verified lead in run-scoped memory.",
			{ lead: LeadSchema },
			async ({ lead }) => {
				const parsed = LeadSchema.parse(lead);
				const stored = getRun(context.runId)?.leads.get(parsed.id);
				if (
					parsed.runId !== context.runId ||
					stored?.signal.hash !== parsed.signal.hash
				) {
					throw new Error(
						"memory_add only accepts a lead verified in this run",
					);
				}
				await addVerifiedLeadMemory(context.runId, stored);
				return jsonResult({ stored: true });
			},
		),
		tool(
			"enrich_lead",
			"Search public sources for cited lead contacts and independent enrichment datapoints. Returned values are the only allowed source of lead datapoints.",
			{
				name: z.string().min(1),
				company: z.string().min(1).optional(),
				signalUrl: z.string().url(),
				channelHint: z.string().min(1).optional(),
			},
			async (args) => jsonResult(await enrichLead(args, context.runId)),
		),
		tool(
			"save_lead",
			`Validate and save one fully composed lead. This independently re-fetches and quote-matches evidence; it is the only path that can emit a verified lead. Fully-valid fictional Lead example (copy the shape, replace the values): ${saveLeadExample}`,
			{
				candidate: CandidateSignalSchema,
				lead: LeadSchema,
				draft: OutreachDraftSchema,
			},
			async ({ candidate, lead, draft }) =>
				jsonResult(await finalizeVerifiedLead(context, candidate, lead, draft)),
		),
		tool(
			"emit_event",
			`Append a validated run event. Never use this for lead_verified or radar_alert; use save_lead.\n${eventPayloadReference}`,
			{
				lane: z.string().min(1),
				type: z.enum([
					"stage_change",
					"agent_started",
					"tool_call",
					"signal_found",
					"signal_rejected",
					"strategy_pivot",
					"error",
				]),
				payload: z.record(z.string(), z.unknown()),
			},
			async (args) => {
				const event = RunEventSchema.parse({
					runId: context.runId,
					ts: new Date().toISOString(),
					seq: (getRun(context.runId)?.events.at(-1)?.seq ?? 0) + 1,
					lane: args.lane,
					type: args.type,
					payload: args.payload,
				});
				if (
					event.type === "signal_found" ||
					event.type === "signal_rejected" ||
					event.type === "strategy_pivot"
				) {
					throw new Error("Hunt events are emitted only by the code conveyor");
				}
				if (event.type === "stage_change") {
					if (
						event.payload.state !== "INTAKE" &&
						event.payload.state !== "ICP_CONFIRM" &&
						event.payload.state !== "STRATEGY"
					) {
						throw new Error(
							"The Claude session may only emit INTAKE, ICP_CONFIRM, or STRATEGY",
						);
					}
					assertValidStageChange(context, event);
				}
				appendEngineEvent(context.runId, event);
				if (event.type === "stage_change") {
					await persistRunState(context);
					if (event.payload.state === "ICP_CONFIRM") {
						return jsonResult({
							emitted: true,
							awaitingIcpSelection: true,
						});
					}
				}
				return jsonResult({ emitted: true });
			},
		),
		tool(
			"budget_read",
			"Read the run's Tavily spend, lead count, and lead quota.",
			{},
			async () => {
				const run = getRun(context.runId);
				return jsonResult({
					...getTavilyBudget(context.runId),
					verifiedLeads: run?.leads.size ?? 0,
					leadQuota: context.quota,
				});
			},
		),
	];
}

const mcpTool = (name: string) => `mcp__customerzero__${name}`;

const agentDefinitions = {
	"intake-analyst": {
		description:
			"Analyze a submitted product domain into a strict ProductBrief.",
		prompt:
			"Use web_extract and web_search. Return only a ProductBrief JSON object grounded in the submitted domain. Mark uncertainty in inferences.",
		model: "claude-sonnet-5",
		tools: [mcpTool("web_extract"), mcpTool("web_search")],
		maxTurns: 6,
	},
	"icp-architect": {
		description: "Create two or three falsifiable ICP hypotheses from a brief.",
		prompt:
			"Return only a JSON array of 2-3 ICPHypothesis objects. Avoid protected traits and include disqualifiers and audience vocabulary.",
		model: "claude-sonnet-5",
		tools: [],
		maxTurns: 6,
	},
	"hunt-strategist": {
		description: "Turn one confirmed ICP into a five-bucket QueryPlan.",
		prompt:
			"Return only one QueryPlan JSON object covering demand, pain, workaround, switching, and timing across public channels.",
		model: "claude-sonnet-5",
		tools: [],
		maxTurns: 6,
	},
} satisfies Record<string, AgentDefinition>;

function orchestrationPrompt(context: RunContext): string {
	return `You are CustomerZero's orchestrator for run ${context.runId}.
Domain: ${context.domain}
Verified lead quota: ${context.quota}; hard maximum 10. Tavily budget: 300 credits.

Use the Agent tool for every specialist. Use only the CustomerZero MCP tools for external actions. Never use filesystem or shell tools. Do not expose hidden reasoning.

Flow:
1. Delegate to intake-analyst. Emit a stage_change INTAKE containing domain and the strict ProductBrief.
2. Delegate to icp-architect. Emit stage_change ICP_CONFIRM containing domain, brief, and 2-3 strict ICP hypotheses. Stop after that tool call and wait for the founder's selection in the next user message.
3. Delegate to hunt-strategist. Emit STRATEGY with a strict QueryPlan. After emitting STRATEGY, do not search, extract, hunt, enrich, score, compose, save leads, or emit HUNTING. End immediately with structured status REVIEW and verifiedLeadCount 0. Deterministic code takes over the hunt.

Every emit_event payload must exactly match the existing RunEvent schema. Never emit lead_verified or radar_alert directly.

${eventPayloadReference}`;
}

async function* gatedOrchestrationPrompt(
	context: RunContext,
): AsyncGenerator<SDKUserMessage> {
	yield {
		type: "user",
		message: { role: "user", content: orchestrationPrompt(context) },
		parent_tool_use_id: null,
	};
	const selectedIcpId = await waitForIcpConfirmation(context.runId);
	yield {
		type: "user",
		message: {
			role: "user",
			content: `The founder selected ICP ${selectedIcpId}. Delegate to hunt-strategist using only that ICP, emit STRATEGY, then end with structured status REVIEW and verifiedLeadCount 0. Do not hunt or emit HUNTING.`,
		},
		parent_tool_use_id: null,
	};
}

function sdkLane(context: RunContext, message: SDKMessage): string {
	if (
		(message.type === "assistant" || message.type === "user") &&
		"subagent_type" in message &&
		typeof message.subagent_type === "string"
	) {
		return message.subagent_type;
	}
	if (
		"parent_tool_use_id" in message &&
		typeof message.parent_tool_use_id === "string"
	) {
		const lane = context.agentLanes.get(message.parent_tool_use_id);
		if (lane) return lane;
	}
	if (message.type === "tool_progress") {
		const lane = context.agentLanes.get(message.tool_use_id);
		if (lane) return lane;
	}
	return "orchestrator";
}

function routeSdkMessage(context: RunContext, message: SDKMessage): void {
	const lane = sdkLane(context, message);
	if (message.type === "assistant") {
		let emitted = false;
		for (const block of message.message.content) {
			if (block.type === "text") {
				emitted = true;
				appendEngineEvent(context.runId, {
					lane,
					type: "agent_started",
					payload: {
						agent: lane,
						message: shortText(block.text, "Agent response received"),
					},
				});
			}
			if (block.type === "tool_use") {
				emitted = true;
				const input = asRecord(block.input);
				const delegatedAgent =
					typeof input?.subagent_type === "string"
						? input.subagent_type
						: undefined;
				if (delegatedAgent) {
					context.agentLanes.set(block.id, delegatedAgent);
				}
				appendEngineEvent(context.runId, {
					lane,
					type: "tool_call",
					payload: {
						tool: block.name.replace(/^mcp__customerzero__/u, ""),
						action: delegatedAgent
							? `Delegating to ${delegatedAgent}`
							: `Calling ${block.name.replace(/^mcp__customerzero__/u, "")}`,
					},
				});
			}
		}
		if (!emitted) {
			appendEngineEvent(context.runId, {
				lane,
				type: "agent_started",
				payload: { agent: lane, message: "Agent response received" },
			});
		}
		return;
	}

	if (message.type === "result") {
		appendEngineEvent(context.runId, {
			lane: "orchestrator",
			type: "agent_started",
			payload: {
				agent: "orchestrator",
				message:
					message.subtype === "success"
						? "Claude orchestration completed"
						: `Claude orchestration stopped: ${message.subtype}`,
			},
		});
		return;
	}

	if (message.type === "tool_progress") {
		appendEngineEvent(context.runId, {
			lane,
			type: "tool_call",
			payload: {
				tool: message.tool_name,
				action: `${message.tool_name} running for ${Math.round(message.elapsed_time_seconds)}s`,
			},
		});
		return;
	}

	if (message.type === "system" && message.subtype === "init") {
		appendEngineEvent(context.runId, {
			lane: "orchestrator",
			type: "agent_started",
			payload: {
				agent: "orchestrator",
				message: `Claude session initialized with ${message.model}`,
			},
		});
		return;
	}

	if (message.type === "user") {
		appendEngineEvent(context.runId, {
			lane,
			type: "agent_started",
			payload: { agent: lane, message: "Agent tool result received" },
		});
		return;
	}

	const subtype = "subtype" in message ? String(message.subtype) : message.type;
	appendEngineEvent(context.runId, {
		lane: "orchestrator",
		type: "agent_started",
		payload: {
			agent: "orchestrator",
			message: `SDK ${message.type}: ${subtype}`,
		},
	});
}

function guardTool<S extends AnyZodRawShape>(
	def: SdkMcpToolDefinition<S>,
): SdkMcpToolDefinition<S> {
	return {
		...def,
		handler: async (args, extra) => {
			try {
				return await def.handler(args, extra);
			} catch (error) {
				console.error(`[engine] tool ${def.name} failed`, error);
				return {
					content: [
						{
							type: "text" as const,
							text: `TOOL_ERROR: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		},
	};
}

async function executeQuery(
	context: RunContext,
	prompt: string | AsyncIterable<SDKUserMessage>,
	agents: Record<string, AgentDefinition>,
	maxTurns: number,
	model: "claude-sonnet-5" | "claude-haiku-4-5",
): Promise<void> {
	const mcpServer = createSdkMcpServer({
		name: "customerzero",
		version: "1.0.0",
		alwaysLoad: true,
		tools: createTools(context).map((def) =>
			guardTool(def as unknown as SdkMcpToolDefinition<AnyZodRawShape>),
		) as unknown as ReturnType<typeof createTools>,
	});
	const allowedMcpTools = [
		"web_search",
		"web_extract",
		"memory_recall",
		"memory_add",
		"enrich_lead",
		"save_lead",
		"emit_event",
		"budget_read",
	].map(mcpTool);
	let failure: string | undefined;
	let completed = false;
	// NOTE: PreToolUse/PostToolUse hooks were removed here deliberately. The
	// CLI's hook-output validator rejected their return shapes ("Error in hook
	// callback"), which poisoned the session transport and surfaced as
	// "Stream closed" on every MCP call. Agent concurrency/limits are enforced
	// at the prompt level instead.
	const stream = query({
		prompt,
		options: {
			model,
			agents,
			mcpServers: { customerzero: mcpServer },
			tools: ["Agent"],
			allowedTools: ["Agent", ...allowedMcpTools],
			permissionMode: "dontAsk",
			settingSources: [],
			strictMcpConfig: true,
			maxTurns,
			persistSession: true,
			forwardSubagentText: true,
			stderr: (data: string) => {
				const text = String(data).trim();
				if (text) console.error("[claude-stderr]", text.slice(0, 600));
			},
			outputFormat: {
				type: "json_schema",
				schema: z.toJSONSchema(CompletionSchema, { target: "draft-7" }),
			},
		},
	});

	try {
		for await (const message of stream) {
			routeSdkMessage(context, message);
			if (message.type === "result") {
				if (message.subtype === "success") {
					CompletionSchema.parse(message.structured_output);
					completed = true;
				} else {
					failure = message.errors.join("; ") || message.subtype;
				}
			}
		}
	} finally {
		try {
			await stream.close?.();
		} catch {
			// already terminated
		}
	}
	if (failure) throw new Error(failure);
	if (!completed)
		throw new Error("Claude session ended without structured output");
}

function selectedIcpFromEvents(runId: string) {
	const run = getRun(runId);
	if (!run?.selectedIcpId) return undefined;
	for (let index = run.events.length - 1; index >= 0; index -= 1) {
		const event = run.events[index];
		if (event.type !== "stage_change") continue;
		const icp = event.payload.icps?.find(
			(hypothesis) => hypothesis.id === run.selectedIcpId,
		);
		if (icp) return icp;
	}
	return undefined;
}

function completedSessionStrategy(runId: string) {
	return getRun(runId)?.state === "STRATEGY"
		? storedConfirmedHunt(runId)
		: undefined;
}

async function* retryStrategyPrompt(
	context: RunContext,
): AsyncGenerator<SDKUserMessage> {
	const run = getRun(context.runId);
	if (run?.state !== "ICP_CONFIRM") {
		for await (const message of gatedOrchestrationPrompt(context)) {
			yield message;
		}
		return;
	}

	const selectedIcpId =
		run.selectedIcpId ?? (await waitForIcpConfirmation(context.runId));
	const icp = selectedIcpFromEvents(context.runId);
	if (!icp || icp.id !== selectedIcpId) {
		throw new Error("Confirmed ICP is missing from the run event history");
	}
	yield {
		type: "user",
		message: {
			role: "user",
			content: `Resume CustomerZero run ${context.runId} from its completed founder gate. Delegate only to hunt-strategist using this confirmed ICP:\n${JSON.stringify(icp)}\n\nEmit exactly one STRATEGY stage_change with a strict QueryPlan whose icpId is ${selectedIcpId}. Do not hunt or emit HUNTING. Then end with structured status REVIEW and verifiedLeadCount 0.\n\n${eventPayloadReference}`,
		},
		parent_tool_use_id: null,
	};
}

async function appendCodeStage(
	context: RunContext,
	payload: Extract<RunEvent, { type: "stage_change" }>["payload"],
): Promise<void> {
	const event = RunEventSchema.parse({
		runId: context.runId,
		ts: new Date().toISOString(),
		seq: (getRun(context.runId)?.events.at(-1)?.seq ?? 0) + 1,
		lane: "system",
		type: "stage_change",
		payload,
	});
	if (event.type !== "stage_change") {
		throw new Error("Expected a stage_change event");
	}
	assertValidStageChange(context, event);
	appendEngineEvent(context.runId, {
		lane: event.lane,
		type: event.type,
		payload: event.payload,
	});
	await persistRunState(context);
}

export async function runOrchestrator(input: OrchestratorInput): Promise<void> {
	const context: RunContext = {
		...input,
		quota: Math.min(input.depth, 10),
		radar: false,
		lastBudgetSpent: -1,
		agentLanes: new Map(),
	};
	resetTavilyBudget(input.runId);
	try {
		await ensureInsForgeTables();
	} catch (error) {
		console.warn(
			"[engine] InsForge schema setup failed",
			error instanceof Error ? error.message : error,
		);
	}
	appendEngineEvent(input.runId, {
		lane: "system",
		type: "stage_change",
		payload: { state: "INTAKE", domain: input.domain },
	});
	emitBudget(context);
	await persistRunState(context);

	let firstAttemptError: unknown;
	try {
		await executeQuery(
			context,
			gatedOrchestrationPrompt(context),
			agentDefinitions,
			250,
			"claude-sonnet-5",
		);
	} catch (error) {
		firstAttemptError = error;
	}

	if (!completedSessionStrategy(input.runId)) {
		appendEngineEvent(input.runId, {
			lane: "system",
			type: "agent_started",
			payload: {
				agent: "system",
				message: "resuming interrupted strategy session — attempt 2",
			},
		});
		try {
			await executeQuery(
				context,
				retryStrategyPrompt(context),
				agentDefinitions,
				250,
				"claude-sonnet-5",
			);
		} catch (retryError) {
			if (!completedSessionStrategy(input.runId)) {
				throw retryError instanceof Error
					? retryError
					: new Error("Claude strategy retry failed");
			}
		}
	}

	const stored = completedSessionStrategy(input.runId);
	if (!stored) {
		if (firstAttemptError instanceof Error) throw firstAttemptError;
		throw new Error(
			"Claude completed before producing a confirmed-ICP strategy",
		);
	}
	await appendCodeStage(context, {
		state: "HUNTING",
		domain: input.domain,
		queryPlan: stored.plan,
	});
	await runConveyorHunt(context, stored.icp, stored.plan);
	await appendCodeStage(context, {
		state: "REVIEW",
		domain: input.domain,
	});
}
