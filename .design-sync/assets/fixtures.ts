// Realistic, schema-valid fixtures for the CustomerZero preview cards.
// Content mirrors the product's own "receipts" domain (a verified lead with a
// quote, a link, and a timestamp). Types are import-only (erased at bundle time).
import type {
	ICPHypothesis,
	Lead,
	OutreachDraft,
	ProductBrief,
	RunEvent,
} from "@/lib/schemas";

const HEX64 = "a1b2c3d4e5f6072839405162738495a6b7c8d9e0f1a2b3c4d5e6f70819202f3a";
const HEX64_B = "0f1e2d3c4b5a69788796a5b4c3d2e1f00112233445566778899aabbccddeeff0";

export const sampleLead: Lead = {
	id: "lead-8f2c9a71b3",
	runId: "run_demo",
	name: "Rina Patel",
	type: "person",
	signal: {
		url: "https://github.com/pylonworks/feedback/issues/184",
		channel: "github",
		quote:
			"We keep losing the why behind customer requests between the call and the roadmap. I need the evidence attached to every ask, not a summary someone typed up three days later.",
		authorHandle: "rina-patel",
		authorDisplay: "Rina Patel",
		company: "Pylonworks",
		publishedAt: "2026-07-11T14:32:00-07:00",
		sourceType: "github_discussion",
		hash: HEX64,
	},
	score: {
		pain: 5,
		fit: 4,
		timing: 4,
		reachability: 3,
		evidenceQuality: 4,
		total: 82,
		stage: "problem_aware",
	},
	enrichment: {
		company: "Pylonworks",
		role: "Head of Customer Success",
		contacts: [
			{
				kind: "public_email",
				value: "rina@pylonworks.com",
				provenanceUrl: "https://pylonworks.com/team",
			},
			{
				kind: "github",
				value: "@rina-patel",
				provenanceUrl: "https://github.com/rina-patel",
			},
		],
		datapoints: [
			{
				label: "Team",
				value: "12-person customer success org",
				kind: "text",
				provenanceUrl: "https://pylonworks.com/about",
			},
		],
		personContext:
			"Leads customer success at a Series A devtools company and is active in their public feedback repo.",
		channel: {
			kind: "public_email",
			value: "rina@pylonworks.com",
			provenanceUrl: "https://pylonworks.com/team",
		},
		reachabilityConfidence: "high",
	},
	whyFit:
		"Runs a CS org drowning in request context lost between calls and the roadmap — exactly the evidence-attached workflow CustomerZero delivers.",
	whyNow:
		"Filed this issue this week and is actively evaluating feedback tooling.",
};

const radarLeadTwo: Lead = {
	id: "lead-3b7e15d902",
	runId: "run_demo",
	name: "Marcus Yuen",
	type: "person",
	signal: {
		url: "https://www.reddit.com/r/SaaS/comments/1m2cq9x/",
		channel: "reddit",
		quote:
			"Spent the whole week stitching together where support tickets and sales notes disagree. There has to be a way to see the source behind each complaint.",
		authorHandle: "myuen_ops",
		company: "Latchwork",
		publishedAt: "2026-07-12T09:05:00-07:00",
		sourceType: "reddit_post",
		hash: HEX64_B,
	},
	score: {
		pain: 4,
		fit: 4,
		timing: 5,
		reachability: 2,
		evidenceQuality: 4,
		total: 78,
		stage: "trigger_present",
	},
	enrichment: {
		company: "Latchwork",
		channel: {
			kind: "thread_reply",
			value: "Reply in source thread",
			provenanceUrl: "https://www.reddit.com/r/SaaS/comments/1m2cq9x/",
		},
		reachabilityConfidence: "medium",
	},
	whyFit:
		"Operations lead reconciling support and sales signal by hand — the exact manual work the swarm removes.",
	whyNow: "Posted the complaint yesterday while actively looking for a tool.",
};

export const radarLeads: Lead[] = [sampleLead, radarLeadTwo];

export const sampleDraft: OutreachDraft = {
	leadId: sampleLead.id,
	channel: "public_email",
	subject: "The 'why' behind every request — attached",
	body: "Hi Rina — saw your note in the Pylonworks feedback repo about losing the why behind customer requests between the call and the roadmap. That gap is exactly what we close: every signal arrives with the original quote, a link, and a timestamp, so the evidence travels with the ask instead of a summary typed up later. How does your team track that today? Happy to show you a run on your own domain.",
	groundedIn: ["https://github.com/pylonworks/feedback/issues/184"],
};

export const sampleBrief: ProductBrief = {
	domain: "pylonworks.com",
	product: "A customer feedback workspace for devtools teams",
	outcome: "Ship the roadmap customers actually asked for",
	buyer: "Head of Customer Success",
	user: "Customer success and product managers",
	priceMotion: "Self-serve with a team tier",
	geography: "North America and EU",
	topUseCase: "Attach evidence to every roadmap request",
	inferences: [
		"Sells to post-Series-A SaaS teams",
		"Public feedback repo signals an evidence-first culture",
	],
};

export const sampleIcps: ICPHypothesis[] = [
	{
		id: "icp-cs-devtools",
		persona: "Head of Customer Success",
		industry: "B2B devtools SaaS",
		companySize: "50–200 employees",
		painTriggers: [
			"context lost between customer calls and the roadmap",
			"evidence for requests scattered across tools",
		],
		positiveSignals: [
			"public feedback repo or changelog",
			"recently hired a CS operations lead",
		],
		disqualifiers: ["pre-revenue", "no customer-facing team"],
		vocabulary: ["evidence", "receipts", "the why behind the ask", "roadmap"],
	},
	{
		id: "icp-founder-preseed",
		persona: "Technical founder",
		industry: "Pre-seed SaaS",
		companySize: "1–10 employees",
		painTriggers: [
			"needs first ten customers with proof of pain",
			"manual scrolling for people describing the problem",
		],
		positiveSignals: [
			"just launched or in private beta",
			"active in founder communities",
		],
		disqualifiers: ["enterprise-only motion"],
		vocabulary: ["first customers", "pain signal", "cold outreach"],
	},
];

const now = "2026-07-13T11:00:00-07:00";
const ts = (n: number) => `2026-07-13T11:0${n}:00-07:00`;

export const huntEvents: RunEvent[] = [
	{
		runId: "run_demo",
		seq: 1,
		ts: now,
		lane: "orchestrator",
		type: "stage_change",
		payload: { state: "HUNTING", domain: "pylonworks.com" },
	},
	{
		runId: "run_demo",
		seq: 2,
		ts: ts(1),
		lane: "hunter:reddit",
		type: "signal_found",
		payload: {
			url: "https://www.reddit.com/r/CustomerSuccess/comments/aa11bb/",
			channel: "reddit",
			title: "How do you keep the reason behind a feature request?",
			quoteCandidate:
				"By the time a request reaches the roadmap the original context is gone.",
			foundBy: "hunter:reddit",
		},
	},
	{
		runId: "run_demo",
		seq: 3,
		ts: ts(2),
		lane: "hunter:github",
		type: "signal_found",
		payload: {
			url: "https://github.com/othercorp/tracker/issues/57",
			channel: "github",
			title: "Feature: attach source evidence to each request",
			quoteCandidate:
				"We need the source quote attached to every request, not a paraphrase.",
			foundBy: "hunter:github",
		},
	},
	{
		runId: "run_demo",
		seq: 4,
		ts: ts(3),
		lane: "hunter:x",
		type: "signal_found",
		payload: {
			url: "https://x.com/someone/status/1780000000000000000",
			channel: "x",
			title: "hot take on feedback tooling",
			quoteCandidate: "most feedback tools are just glorified spreadsheets lol",
			foundBy: "hunter:x",
		},
	},
	{
		runId: "run_demo",
		seq: 5,
		ts: ts(4),
		lane: "verifier",
		type: "signal_rejected",
		payload: {
			signal: {
				url: "https://x.com/someone/status/1780000000000000000",
				channel: "x",
				title: "hot take on feedback tooling",
				quoteCandidate:
					"most feedback tools are just glorified spreadsheets lol",
				foundBy: "hunter:x",
			},
			reason: "no quoted ICP-relevant pain",
		},
	},
	{
		runId: "run_demo",
		seq: 6,
		ts: ts(5),
		lane: "hunt-strategist",
		type: "strategy_pivot",
		payload: {
			rationale:
				"reddit demand pack produced no advancing candidates; pivoting to github pain.",
		},
	},
	{
		runId: "run_demo",
		seq: 7,
		ts: ts(6),
		lane: "verifier",
		type: "lead_verified",
		payload: sampleLead,
	},
	{
		runId: "run_demo",
		seq: 8,
		ts: ts(7),
		lane: "system",
		type: "budget_update",
		payload: { spent: 12, total: 50, provider: "tavily" },
	},
];
