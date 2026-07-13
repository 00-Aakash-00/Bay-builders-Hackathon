export interface YouComSearchResult {
	title: string;
	url: string;
	content: string;
	publishedDate?: string;
	synthetic?: boolean;
}

interface YouComResult {
	title?: string;
	url?: string;
	description?: string;
	snippet?: string;
	snippets?: string[];
	page_age?: string;
	published_date?: string;
}

interface YouComResponse {
	results?: {
		web?: YouComResult[];
		news?: YouComResult[];
	};
}

const SYNTHETIC_CONTENT =
	"[Synthetic fixture] A founder said: I spend every Friday stitching together public threads to find a few people who urgently need what we built.";

export interface YouComContentResult {
	url: string;
	rawContent: string;
}

function htmlToText(html: string): string {
	return html
		.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/giu, " ")
		.replace(/<[^>]+>/gu, " ")
		.replace(/&nbsp;/gu, " ")
		.replace(/&amp;/gu, "&")
		.replace(/&lt;/gu, "<")
		.replace(/&gt;/gu, ">")
		.replace(/&#x27;|&#39;/gu, "'")
		.replace(/&quot;/gu, '"')
		.replace(/\s+/gu, " ")
		.trim();
}

export async function fetchYouComContents(
	urls: string[],
): Promise<YouComContentResult[]> {
	const apiKey = process.env.YDC_API_KEY;
	if (!apiKey || urls.length === 0) return [];

	try {
		const response = await fetch("https://ydc-index.io/v1/contents", {
			method: "POST",
			headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
			body: JSON.stringify({ urls }),
			signal: AbortSignal.timeout(20_000),
		});
		if (!response.ok) {
			throw new Error(`You.com contents returned ${response.status}`);
		}

		const payload = (await response.json()) as Array<{
			url?: string;
			html?: string;
		}>;
		if (!Array.isArray(payload)) return [];
		return payload
			.map((entry) => ({
				url: entry.url ?? "",
				rawContent: htmlToText(entry.html ?? ""),
			}))
			.filter((entry) => entry.url.length > 0 && entry.rawContent.length > 0);
	} catch (error) {
		throw new Error("You.com contents failed", { cause: error });
	}
}

export async function searchYouCom(
	query: string,
	options?: { count?: number },
): Promise<YouComSearchResult[]> {
	const apiKey = process.env.YDC_API_KEY;
	const count = options?.count ?? 10;

	if (!apiKey) {
		return [
			{
				title: `[Synthetic] You.com news signal for "${query}"`,
				url: "https://example.com/synthetic-youcom-signal",
				content: SYNTHETIC_CONTENT,
				synthetic: true,
			},
		].slice(0, count);
	}

	try {
		const url = new URL("https://ydc-index.io/v1/search");
		url.searchParams.set("query", query);
		url.searchParams.set("count", String(count));

		// TODO-verify: confirm the web/news result fields against the issued You.com key.
		const response = await fetch(url, {
			headers: { "X-API-Key": apiKey },
			signal: AbortSignal.timeout(15_000),
		});
		if (!response.ok) {
			throw new Error(`You.com search returned ${response.status}`);
		}

		const payload = (await response.json()) as YouComResponse;
		const web = payload.results?.web ?? [];
		const news = payload.results?.news ?? [];
		const blended = Array.from(
			{ length: Math.max(web.length, news.length) },
			(_, index) => [web[index], news[index]],
		).flatMap((results) => results.filter(Boolean) as YouComResult[]);
		return blended
			.map((result) => ({
				title: result.title ?? "",
				url: result.url ?? "",
				content:
					result.description ??
					result.snippet ??
					result.snippets?.join("\n") ??
					"",
				publishedDate: result.published_date ?? result.page_age,
			}))
			.filter((result) => result.title.length > 0 && result.url.length > 0)
			.slice(0, count);
	} catch (error) {
		throw new Error("You.com search failed", { cause: error });
	}
}
