import { z } from "zod";

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const UrlSchema = z
	.string()
	.url()
	.refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
		message: "URL must use http or https",
	});

export const RunStateSchema = z.enum([
	"INTAKE",
	"ICP_CONFIRM",
	"STRATEGY",
	"HUNTING",
	"REVIEW",
	"DELIVERED",
	"RADAR",
	"FAILED",
	"KILLED",
]);
export type RunState = z.infer<typeof RunStateSchema>;

export const SignalStageSchema = z.enum([
	"FOUND",
	"EXTRACTED",
	"DEDUPED",
	"VERIFIED",
	"SCORED",
	"ENRICHED",
	"DRAFTED",
	"DUPLICATE",
	"REJECTED",
	"BELOW_THRESHOLD",
]);
export type SignalStage = z.infer<typeof SignalStageSchema>;

export const ChannelSchema = z.enum([
	"reddit",
	"hn",
	"x",
	"reviews",
	"github",
	"jobs",
	"forums",
	"news",
]);
export type Channel = z.infer<typeof ChannelSchema>;

export const ProviderSchema = z.enum(["tavily", "youcom", "nimble"]);
export type Provider = z.infer<typeof ProviderSchema>;

export const ProductBriefSchema = z
	.object({
		domain: z.string().min(1),
		product: z.string().min(1),
		outcome: z.string().min(1),
		buyer: z.string().min(1),
		user: z.string().min(1),
		priceMotion: z.string().min(1),
		geography: z.string().min(1),
		topUseCase: z.string().min(1),
		inferences: z.array(z.string().min(1)),
	})
	.strict();
export type ProductBrief = z.infer<typeof ProductBriefSchema>;

export const ICPHypothesisSchema = z
	.object({
		id: z.string().min(1),
		persona: z.string().min(1),
		industry: z.string().min(1),
		companySize: z.string().min(1),
		painTriggers: z.array(z.string().min(1)).min(1),
		positiveSignals: z.array(z.string().min(1)).min(1),
		disqualifiers: z.array(z.string().min(1)),
		vocabulary: z.array(z.string().min(1)).min(1),
	})
	.strict();
export type ICPHypothesis = z.infer<typeof ICPHypothesisSchema>;

export const BudgetAllocationSchema = z
	.object({
		providers: z
			.array(
				z
					.object({
						provider: ProviderSchema,
						allocated: z.number().nonnegative(),
					})
					.strict(),
			)
			.min(1),
	})
	.strict();
export type BudgetAllocation = z.infer<typeof BudgetAllocationSchema>;

export const QueryPackSchema = z
	.object({
		bucket: z.enum(["demand", "pain", "workaround", "switching", "timing"]),
		channel: ChannelSchema,
		provider: ProviderSchema,
		queries: z.array(z.string().min(1)).min(1),
	})
	.strict();
export type QueryPack = z.infer<typeof QueryPackSchema>;

export const QueryPlanSchema = z
	.object({
		icpId: z.string().min(1),
		packs: z.array(QueryPackSchema).min(1),
		budget: BudgetAllocationSchema,
	})
	.strict();
export type QueryPlan = z.infer<typeof QueryPlanSchema>;

export const CandidateSignalSchema = z
	.object({
		url: UrlSchema,
		channel: ChannelSchema,
		title: z.string().min(1),
		authorHandle: z.string().min(1).optional(),
		quoteCandidate: z.string().min(1),
		publishedAt: IsoDateTimeSchema.optional(),
		foundBy: z.string().min(1),
	})
	.strict();
export type CandidateSignal = z.infer<typeof CandidateSignalSchema>;

export const ExtractedSignalSchema = z
	.object({
		url: UrlSchema,
		channel: ChannelSchema,
		quote: z.string().min(1),
		authorHandle: z.string().min(1).optional(),
		authorDisplay: z.string().min(1).optional(),
		company: z.string().min(1).optional(),
		publishedAt: z.union([IsoDateTimeSchema, z.literal("date_unavailable")]),
		sourceType: z.string().min(1),
		hash: z.string().regex(/^[a-f0-9]{64}$/i),
	})
	.strict();
export type ExtractedSignal = z.infer<typeof ExtractedSignalSchema>;

export const VerdictSchema = z
	.object({
		signalHash: z.string().regex(/^[a-f0-9]{64}$/i),
		verdict: z.enum(["VERIFIED", "REJECTED"]),
		quoteMatchScore: z.number().min(0).max(1),
		recencyOk: z.boolean(),
		authorshipOk: z.boolean(),
		rejectReason: z.string().min(1).optional(),
		fetchedAt: IsoDateTimeSchema,
	})
	.strict();
export type Verdict = z.infer<typeof VerdictSchema>;

export const EnrichmentSchema = z
	.object({
		company: z.string().min(1).optional(),
		role: z.string().min(1).optional(),
		companyContext: z.string().min(1).optional(),
		channel: z
			.object({
				kind: z.enum(["thread_reply", "public_email", "public_profile"]),
				value: z.string().min(1),
				provenanceUrl: UrlSchema,
			})
			.strict(),
		reachabilityConfidence: z.enum(["high", "medium", "low"]),
	})
	.strict();
export type Enrichment = z.infer<typeof EnrichmentSchema>;

export const ScoreBreakdownSchema = z
	.object({
		pain: z.number().min(0).max(5),
		fit: z.number().min(0).max(5),
		timing: z.number().min(0).max(5),
		reachability: z.number().min(0).max(5),
		evidenceQuality: z.number().min(0).max(5),
		total: z.number().min(0).max(100),
		stage: z.enum(["high_intent", "problem_aware", "trigger_present"]),
	})
	.strict();
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const LeadSchema = z
	.object({
		id: z.string().min(1),
		runId: z.string().min(1),
		name: z.string().min(1),
		type: z.enum(["person", "company"]),
		signal: ExtractedSignalSchema,
		score: ScoreBreakdownSchema,
		enrichment: EnrichmentSchema,
		whyFit: z.string().min(1),
		whyNow: z.string().min(1),
		caution: z.string().min(1).optional(),
	})
	.strict();
export type Lead = z.infer<typeof LeadSchema>;

export const OutreachDraftSchema = z
	.object({
		leadId: z.string().min(1),
		channel: z.string().min(1),
		subject: z.string().min(1).optional(),
		body: z
			.string()
			.trim()
			.min(1)
			.refine((body) => body.split(/\s+/u).length <= 90, {
				message: "Outreach draft body must be 90 words or fewer",
			}),
		groundedIn: z.array(UrlSchema).min(1),
	})
	.strict();
export type OutreachDraft = z.infer<typeof OutreachDraftSchema>;

export const PatternInsightSchema = z
	.object({
		title: z.string().min(1),
		count: z.number().int().nonnegative(),
		insight: z.string().min(1),
	})
	.strict();
export type PatternInsight = z.infer<typeof PatternInsightSchema>;

export const RadarQueryPackSchema = z
	.object({
		runId: z.string().min(1),
		icpId: z.string().min(1),
		queries: z.array(QueryPackSchema).min(1),
		intervalMinutes: z.number().int().positive(),
	})
	.strict();
export type RadarQueryPack = z.infer<typeof RadarQueryPackSchema>;

export const StageChangePayloadSchema = z
	.object({
		state: RunStateSchema,
		domain: z.string().min(1).optional(),
		brief: ProductBriefSchema.optional(),
		icps: z.array(ICPHypothesisSchema).min(2).max(3).optional(),
		queryPlan: QueryPlanSchema.optional(),
	})
	.strict();

export const AgentStartedPayloadSchema = z
	.object({
		agent: z.string().min(1),
		message: z.string().min(1),
	})
	.strict();

export const ToolCallPayloadSchema = z
	.object({
		tool: z.string().min(1),
		action: z.string().min(1),
	})
	.strict();

export const SignalRejectedPayloadSchema = z
	.object({
		signal: CandidateSignalSchema,
		reason: z.string().min(1),
	})
	.strict();

export const LeadScoredPayloadSchema = z
	.object({
		leadId: z.string().min(1),
		score: ScoreBreakdownSchema,
	})
	.strict();

export const DraftReadyPayloadSchema = z
	.object({
		draft: OutreachDraftSchema,
		status: z.enum(["draft", "sent"]),
	})
	.strict();

export const StrategyPivotPayloadSchema = z
	.object({
		rationale: z.string().min(1),
	})
	.strict();

export const BudgetUpdatePayloadSchema = z
	.object({
		spent: z.number().nonnegative(),
		total: z.number().nonnegative(),
		provider: ProviderSchema.optional(),
	})
	.strict();

export const ErrorPayloadSchema = z
	.object({
		message: z.string().min(1),
		recoverable: z.boolean(),
	})
	.strict();

const RunEventBaseShape = {
	runId: z.string().min(1),
	ts: IsoDateTimeSchema,
	seq: z.number().int().positive(),
	lane: z.string().min(1),
};

export const RunEventSchema = z.discriminatedUnion("type", [
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("stage_change"),
			payload: StageChangePayloadSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("agent_started"),
			payload: AgentStartedPayloadSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("tool_call"),
			payload: ToolCallPayloadSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("signal_found"),
			payload: CandidateSignalSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("signal_rejected"),
			payload: SignalRejectedPayloadSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("lead_verified"),
			payload: LeadSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("lead_scored"),
			payload: LeadScoredPayloadSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("draft_ready"),
			payload: DraftReadyPayloadSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("strategy_pivot"),
			payload: StrategyPivotPayloadSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("budget_update"),
			payload: BudgetUpdatePayloadSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("radar_alert"),
			payload: LeadSchema,
		})
		.strict(),
	z
		.object({
			...RunEventBaseShape,
			type: z.literal("error"),
			payload: ErrorPayloadSchema,
		})
		.strict(),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
