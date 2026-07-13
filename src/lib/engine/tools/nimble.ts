export interface NimbleSearchResult {
	title: string;
	url: string;
	content: string;
	publishedDate?: string;
	synthetic?: boolean;
}

export interface NimbleExtractResult {
	url: string;
	rawContent: string;
	synthetic?: boolean;
}

interface OrganicResult {
	title?: string;
	url?: string;
	description?: string;
	snippet?: string;
	date?: string;
	published_date?: string;
}

interface NimbleSerpResponse {
	data?: {
		parsing?: {
			entities?: {
				OrganicResult?: OrganicResult[];
			};
		};
	};
}

const SYNTHETIC_CONTENT =
	"[Synthetic fixture] A founder said: I spend every Friday stitching together public threads to find a few people who urgently need what we built.";

export async function searchNimble(
	query: string,
	options?: { maxResults?: number },
): Promise<NimbleSearchResult[]> {
	const apiKey = process.env.NIMBLE_API_KEY;
	const maxResults = options?.maxResults ?? 10;

	if (!apiKey) {
		return [
			{
				title: `[Synthetic] Nimble signal for "${query}"`,
				url: "https://example.com/synthetic-nimble-signal",
				content: SYNTHETIC_CONTENT,
				synthetic: true,
			},
		].slice(0, maxResults);
	}

	try {
		// TODO-verify: Nimble's SERP surface is still migrating; confirm this wire shape with the issued key.
		const response = await fetch("https://sdk.nimbleway.com/v1/serp", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				search_engine: "google_search",
				query,
				no_html: true,
				num_results: maxResults,
			}),
			signal: AbortSignal.timeout(15_000),
		});

		if (!response.ok) {
			throw new Error(`Nimble search returned ${response.status}`);
		}

		const payload = (await response.json()) as NimbleSerpResponse;
		return (payload.data?.parsing?.entities?.OrganicResult ?? [])
			.map((result) => ({
				title: result.title ?? "",
				url: result.url ?? "",
				content: result.description ?? result.snippet ?? "",
				publishedDate: result.published_date ?? result.date,
			}))
			.filter((result) => result.title.length > 0 && result.url.length > 0)
			.slice(0, maxResults);
	} catch (error) {
		throw new Error("Nimble search failed", { cause: error });
	}
}

export async function extractNimble(
	urls: string[],
): Promise<NimbleExtractResult[]> {
	const apiKey = process.env.NIMBLE_API_KEY;

	if (!apiKey) {
		return urls.map((url) => ({
			url,
			rawContent: SYNTHETIC_CONTENT,
			synthetic: true,
		}));
	}

	try {
		return await Promise.all(
			urls.map(async (url) => {
				// TODO-verify: confirm the extract response shape with the issued Nimble key.
				const response = await fetch("https://sdk.nimbleway.com/v1/extract", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ url, formats: ["markdown"] }),
					signal: AbortSignal.timeout(15_000),
				});

				if (!response.ok) {
					throw new Error(`Nimble extract returned ${response.status}`);
				}

				const payload = (await response.json()) as {
					data?: { markdown?: string };
				};
				if (typeof payload.data?.markdown !== "string") {
					throw new Error("Nimble extract response did not include markdown");
				}

				return { url, rawContent: payload.data.markdown };
			}),
		);
	} catch (error) {
		throw new Error("Nimble extract failed", { cause: error });
	}
}
