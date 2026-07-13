export const TAVILY_RUN_BUDGET = 300;

export interface TavilySearchResult {
	title: string;
	url: string;
	content: string;
	score?: number;
	publishedDate?: string;
}

export interface TavilyExtractResult {
	url: string;
	rawContent: string;
}

interface RunBudget {
	spent: number;
	reserved: number;
}

interface TavilyUsage {
	credits?: number;
}

interface SearchResponse {
	results?: Array<{
		title: string;
		url: string;
		content: string;
		score?: number;
		published_date?: string;
	}>;
	usage?: TavilyUsage;
}

interface ExtractResponse {
	results?: Array<{
		url: string;
		raw_content: string;
	}>;
	usage?: TavilyUsage;
}

const API_BASE_URL = "https://api.tavily.com";
const BREAKER_DURATION_MS = 60_000;
const FAILURE_THRESHOLD = 3;
const REQUEST_TIMEOUT_MS = 15_000;

const budgets = new Map<string, RunBudget>();
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

function getBudget(runId: string): RunBudget {
	let budget = budgets.get(runId);
	if (!budget) {
		budget = { spent: 0, reserved: 0 };
		budgets.set(runId, budget);
	}
	return budget;
}

function reserveBudget(runId: string, credits: number): void {
	const budget = getBudget(runId);
	if (budget.spent + budget.reserved + credits > TAVILY_RUN_BUDGET) {
		throw new Error("Tavily run budget exhausted");
	}
	budget.reserved += credits;
}

function releaseBudget(runId: string, credits: number): void {
	const budget = getBudget(runId);
	budget.reserved -= credits;
}

function commitBudget(runId: string, reserved: number, spent: number): void {
	const budget = getBudget(runId);
	budget.reserved -= reserved;
	budget.spent += spent;
}

function ensureCircuitClosed(): void {
	if (Date.now() < breakerOpenUntil) {
		throw new Error("Tavily circuit breaker is open");
	}
}

function recordFailure(rateLimited: boolean): void {
	if (rateLimited) {
		consecutiveFailures = 0;
		breakerOpenUntil = Date.now() + BREAKER_DURATION_MS;
		return;
	}

	consecutiveFailures += 1;
	if (consecutiveFailures >= FAILURE_THRESHOLD) {
		consecutiveFailures = 0;
		breakerOpenUntil = Date.now() + BREAKER_DURATION_MS;
	}
}

function recordSuccess(): void {
	consecutiveFailures = 0;
	if (Date.now() >= breakerOpenUntil) {
		breakerOpenUntil = 0;
	}
}

async function postTavily<T>(
	path: "search" | "extract",
	apiKey: string,
	body: Record<string, unknown>,
): Promise<T> {
	ensureCircuitClosed();

	let response: Response;
	try {
		response = await fetch(`${API_BASE_URL}/${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch {
		recordFailure(false);
		throw new Error(`Tavily ${path} request failed`);
	}

	if (!response.ok) {
		recordFailure(response.status === 429);
		throw new Error(`Tavily ${path} failed (${response.status})`);
	}

	try {
		const payload = (await response.json()) as T;
		recordSuccess();
		return payload;
	} catch {
		recordFailure(false);
		throw new Error(`Tavily ${path} returned invalid JSON`);
	}
}

function responseCredits(usage: TavilyUsage | undefined): number | undefined {
	return typeof usage?.credits === "number" && usage.credits >= 0
		? usage.credits
		: undefined;
}

export async function searchTavily(
	runId: string,
	query: string,
	options?: { maxResults?: number },
): Promise<TavilySearchResult[]> {
	const apiKey = process.env.TAVILY_API_KEY;
	if (!apiKey) return [];

	const reserved = 1;
	reserveBudget(runId, reserved);
	try {
		const response = await postTavily<SearchResponse>("search", apiKey, {
			query,
			search_depth: "basic",
			max_results: options?.maxResults ?? 5,
			include_usage: true,
		});
		const spent = responseCredits(response.usage) ?? 1;
		const results = (response.results ?? []).map((result) => ({
			title: result.title,
			url: result.url,
			content: result.content,
			score: result.score,
			publishedDate: result.published_date,
		}));
		commitBudget(runId, reserved, spent);
		return results;
	} catch (error) {
		releaseBudget(runId, reserved);
		throw error;
	}
}

export async function extractTavily(
	runId: string,
	urls: string[],
): Promise<TavilyExtractResult[]> {
	const apiKey = process.env.TAVILY_API_KEY;
	if (!apiKey || urls.length === 0) return [];

	const reserved = Math.ceil(urls.length / 5);
	reserveBudget(runId, reserved);
	try {
		const response = await postTavily<ExtractResponse>("extract", apiKey, {
			urls,
			extract_depth: "basic",
			include_usage: true,
		});
		const results = response.results ?? [];
		const spent = responseCredits(response.usage) ?? results.length / 5;
		const mappedResults = results.map((result) => ({
			url: result.url,
			rawContent: result.raw_content,
		}));
		commitBudget(runId, reserved, spent);
		return mappedResults;
	} catch (error) {
		releaseBudget(runId, reserved);
		throw error;
	}
}

export function getTavilyBudget(runId: string): {
	spent: number;
	total: number;
} {
	return {
		spent: budgets.get(runId)?.spent ?? 0,
		total: TAVILY_RUN_BUDGET,
	};
}

export function resetTavilyBudget(runId: string): void {
	budgets.delete(runId);
}
