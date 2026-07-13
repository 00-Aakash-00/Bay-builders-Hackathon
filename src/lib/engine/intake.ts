import { type ProductBrief, ProductBriefSchema } from "@/lib/schemas";
import { extractTavily, resetTavilyBudget, searchTavily } from "./tools/tavily";

const FETCH_TIMEOUT_MS = 8_000;
const NOT_STATED = "not stated on site";

interface SiteCopy {
	heading?: string;
	heroSentences: string[];
	lines: string[];
	sentences: string[];
}

function normalizeHomepage(domain: string): URL {
	const value = domain.trim();
	const explicitScheme = value.match(/^([a-z][a-z0-9+.-]*):/iu)?.[1];
	if (explicitScheme && !/^https?$/iu.test(explicitScheme)) {
		throw new TypeError("Domain must use http or https");
	}
	const url = new URL(
		/^https?:\/\//iu.test(value) ? value : `https://${value}`,
	);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new TypeError("Domain must use http or https");
	}
	url.protocol = "https:";
	url.username = "";
	url.password = "";
	url.pathname = "/";
	url.search = "";
	url.hash = "";
	return url;
}

function decodeEntities(value: string): string {
	return value
		.replaceAll("&amp;", "&")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">");
}

function cleanLine(value: string): string {
	return decodeEntities(value)
		.replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
		.replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
		.replace(/<[^>]+>/gu, " ")
		.replace(/^\s{0,3}(?:#{1,6}|[-*+] |\d+[.)] )\s*/u, "")
		.replace(/[*_`~]/gu, "")
		.replace(/\\([\p{P}\p{S}])/gu, "$1")
		.replace(/\s+/gu, " ")
		.trim();
}

function splitSentences(lines: string[]): string[] {
	return lines.flatMap(
		(line) =>
			line.match(/[^.!?]+(?:[.!?]+|$)/gu)?.map((part) => part.trim()) ?? [],
	);
}

function parseCopy(rawContent: string): SiteCopy {
	let heading: string | undefined;
	let headingIndex: number | undefined;
	const lines: string[] = [];

	for (const rawLine of rawContent.replace(/\r/gu, "").split("\n")) {
		const headingMatch = rawLine.match(/^\s*#\s+(.+)$/u);
		const line = cleanLine(rawLine);
		if (!line || /^https?:\/\//iu.test(line)) continue;
		if (headingMatch && !heading) {
			heading = cleanLine(headingMatch[1]);
			headingIndex = lines.length;
		}
		lines.push(line);
	}

	const heroStart =
		headingIndex === undefined ? 0 : Math.max(0, headingIndex - 1);
	const heroLines = lines.slice(heroStart, heroStart + 7);
	return {
		heading,
		heroSentences: splitSentences(heroLines),
		lines,
		sentences: splitSentences(lines),
	};
}

function wordCount(value: string): number {
	return value.split(/\s+/u).filter(Boolean).length;
}

function descriptiveSentence(sentences: string[]): string | undefined {
	const predicate =
		/\b(?:is|are|helps?|lets?|enables?|provides?|replaces?|turns?|automates?|replays?|analy[sz]es?|builds?|connects?|gives?|makes?)\b/iu;
	return sentences.find(
		(sentence) =>
			wordCount(sentence) >= 8 &&
			wordCount(sentence) <= 60 &&
			predicate.test(sentence) &&
			!/\b(?:illustrative|cookie|privacy policy|terms of service)\b/iu.test(
				sentence,
			),
	);
}

function productCandidate(copy: SiteCopy): string | undefined {
	const description = descriptiveSentence(copy.heroSentences);
	if (description) return description;
	if (
		copy.heading &&
		wordCount(copy.heading) >= 3 &&
		!/\b(?:access denied|error|home|just a moment|loading|not found|welcome)\b/iu.test(
			copy.heading,
		)
	) {
		return copy.heading;
	}
	return undefined;
}

function ensureSentence(value: string): string {
	return /[.!?]$/u.test(value) ? value : `${value}.`;
}

function quoteFor(
	copy: SiteCopy,
	pattern: RegExp,
	exclude?: string,
): string | undefined {
	return copy.sentences.find(
		(sentence) =>
			sentence !== exclude &&
			wordCount(sentence) >= 6 &&
			wordCount(sentence) <= 60 &&
			!/^(?:and|by|for|from|of|or|to|with)\b/iu.test(sentence) &&
			/\b(?:are|builds?|can|connects?|cuts?|enables?|generates?|gives?|grows?|helps?|improves?|is|judges?|lets?|makes?|manages?|monitors?|provides?|reclaims?|redirects?|reduces?|replaces?|replays?|routes?|saves?|scores?|should|turns?|will)\b/iu.test(
				sentence,
			) &&
			pattern.test(sentence),
	);
}

function deriveAudience(
	text: string,
	inferences: string[],
): Pick<ProductBrief, "buyer" | "user"> {
	if (/\b(?:venture capital|VC funds?|VC firms?)\b/iu.test(text)) {
		inferences.push(
			"Buyer inferred from the site's repeated references to “VC funds” or “VC firms”.",
		);
		if (/\bpartners?\b/iu.test(text)) {
			inferences.push(
				"User inferred from the site's references to fund “partners”.",
			);
			return { buyer: "VC funds", user: "VC fund partners" };
		}
		return { buyer: "VC funds", user: NOT_STATED };
	}

	const audiences = [
		{ pattern: /\bindie founders?\b/iu, label: "Indie founders" },
		{ pattern: /\bfounders?\b/iu, label: "Founders" },
		{
			pattern: /\b(?:developers?|engineering teams?)\b/iu,
			label: "Developers and engineering teams",
		},
		{ pattern: /\bproduct teams?\b/iu, label: "Product teams" },
		{ pattern: /\bsales teams?\b/iu, label: "Sales teams" },
		{ pattern: /\bmarketers?|marketing teams?\b/iu, label: "Marketing teams" },
	] as const;
	const audience = audiences.find(({ pattern }) => pattern.test(text));
	if (!audience) return { buyer: NOT_STATED, user: NOT_STATED };

	inferences.push(
		`Buyer and user inferred from the site's explicit references to ${audience.label.toLocaleLowerCase("en-US")}.`,
	);
	return { buyer: audience.label, user: audience.label };
}

function derivePriceMotion(text: string, inferences: string[]): string {
	if (/\b(?:book (?:a )?demo|contact sales|talk to sales)\b/iu.test(text)) {
		inferences.push(
			"Price motion inferred as sales-led from the site's demo or sales-contact call to action.",
		);
		return "Sales-led; pricing not stated on site";
	}
	if (/\b(?:free trial|start (?:for )?free|sign up free)\b/iu.test(text)) {
		inferences.push(
			"Price motion inferred as self-serve from the site's free-start call to action.",
		);
		return "Self-serve; exact pricing not stated on site";
	}
	const price = text.match(
		/(?:\$|€|£)\s?\d[\d,.]*(?:\s*(?:\/|per)\s*(?:month|year))?/iu,
	)?.[0];
	if (!price) return NOT_STATED;
	inferences.push(
		"Price motion inferred from a public price shown on the site.",
	);
	return `Public price shown: ${price}`;
}

function deriveGeography(text: string, inferences: string[]): string {
	const geography = [
		{ pattern: /\bworldwide\b/iu, label: "Worldwide" },
		{ pattern: /\bglobal(?:ly)?\b/iu, label: "Global" },
		{ pattern: /\bUnited States\b/iu, label: "United States" },
		{ pattern: /\bUnited Kingdom\b/iu, label: "United Kingdom" },
		{ pattern: /\bEurope(?:an)?\b/iu, label: "Europe" },
	] as const;
	const match = geography.find(({ pattern }) => pattern.test(text));
	if (!match) return NOT_STATED;
	inferences.push(
		`Geography normalized to “${match.label}” from an explicit site reference.`,
	);
	return match.label;
}

function sameDomain(candidate: string, homepage: URL): boolean {
	try {
		const candidateHost = new URL(candidate).hostname.replace(/^www\./u, "");
		const homepageHost = homepage.hostname.replace(/^www\./u, "");
		return (
			candidateHost === homepageHost ||
			candidateHost.endsWith(`.${homepageHost}`)
		);
	} catch {
		return false;
	}
}

async function buildBrief(
	homepage: URL,
	runId: string,
	deadline: number,
): Promise<ProductBrief | undefined> {
	let rawContent = "";
	try {
		rawContent =
			(await extractTavily(runId, [homepage.href]))[0]?.rawContent ?? "";
	} catch {
		// A domain-restricted search below is the one allowed fallback.
	}

	const copy = parseCopy(rawContent);
	let searchCopy: SiteCopy | undefined;
	let usedSearchFallback = false;
	const thin = copy.lines.join(" ").length < 180 || !productCandidate(copy);
	if (thin && Date.now() < deadline - 250) {
		try {
			const results = await searchTavily(
				runId,
				`site:${homepage.hostname} ${homepage.hostname}`,
				{ maxResults: 3 },
			);
			const restricted = results.filter((result) =>
				sameDomain(result.url, homepage),
			);
			if (restricted.length > 0) {
				usedSearchFallback = true;
				searchCopy = parseCopy(
					restricted
						.flatMap((result) => [`# ${result.title}`, result.content])
						.join("\n\n"),
				);
			}
		} catch {
			// The caller falls back to the deterministic demo brief.
		}
	}

	const productSource =
		productCandidate(copy) ??
		(searchCopy ? productCandidate(searchCopy) : undefined);
	if (!productSource || wordCount(productSource) < 3) return undefined;

	const product = ensureSentence(productSource);
	const combinedCopy: SiteCopy = {
		heading: copy.heading ?? searchCopy?.heading,
		heroSentences: [
			...copy.heroSentences,
			...(searchCopy?.heroSentences ?? []),
		],
		lines: [...copy.lines, ...(searchCopy?.lines ?? [])],
		sentences: [...copy.sentences, ...(searchCopy?.sentences ?? [])],
	};
	const text = combinedCopy.lines.join(" ");
	const inferences: string[] = [];
	if (usedSearchFallback) {
		inferences.push(
			"Homepage extraction was thin; a domain-restricted Tavily search supplied additional site context.",
		);
	}
	if (productSource === copy.heading || productSource === searchCopy?.heading) {
		inferences.push(
			"Product description uses the homepage headline because no explanatory hero sentence was available.",
		);
	}
	const audience = deriveAudience(text, inferences);
	const outcomeClaim = quoteFor(
		combinedCopy,
		/\b(?:save|reduce|cut|reclaim|redirect|faster|smarter|replace|collapse|increase|improve|grow|generate)\w*\b/iu,
		productSource,
	);
	let outcome = outcomeClaim;
	if (outcomeClaim) {
		inferences.push(
			"Outcome selected heuristically from a site sentence with an explicit result verb.",
		);
	} else if (
		/\b(?:save|reduce|cut|reclaim|redirect|replace|increase|improve|generate)\w*\b/iu.test(
			productSource,
		)
	) {
		outcome = product;
		inferences.push(
			"Outcome inferred from the sourced product sentence because it states an explicit result.",
		);
	} else {
		outcome = NOT_STATED;
	}
	const useCaseClaim = quoteFor(
		combinedCopy,
		/\b(?:source|score|route|diligence|report|monitor|replay|judge|analy[sz]e|automate|generate|manage)\w*\b/iu,
		productSource,
	);
	let topUseCase = useCaseClaim;
	if (useCaseClaim) {
		inferences.push(
			"Top use case selected heuristically from a site sentence describing a concrete workflow.",
		);
	} else if (
		/\b(?:source|score|route|diligence|report|monitor|replay|judge|analy[sz]e|automate|generate|manage)\w*\b/iu.test(
			productSource,
		)
	) {
		topUseCase = product;
		inferences.push(
			"Top use case inferred from the sourced product sentence because it names a concrete workflow.",
		);
	} else {
		topUseCase = NOT_STATED;
	}

	const parsed = ProductBriefSchema.safeParse({
		domain: homepage.href,
		product,
		outcome,
		...audience,
		priceMotion: derivePriceMotion(text, inferences),
		geography: deriveGeography(text, inferences),
		topUseCase,
		inferences,
	});
	return parsed.success ? parsed.data : undefined;
}

export async function fetchRealBrief(
	domain: string,
): Promise<ProductBrief | undefined> {
	try {
		const homepage = normalizeHomepage(domain);
		const deadline = Date.now() + FETCH_TIMEOUT_MS;
		const runId = `intake:${crypto.randomUUID()}`;
		const work = buildBrief(homepage, runId, deadline).finally(() => {
			resetTavilyBudget(runId);
		});
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				work,
				new Promise<undefined>((resolve) => {
					timeout = setTimeout(() => resolve(undefined), FETCH_TIMEOUT_MS);
				}),
			]);
		} finally {
			if (timeout) clearTimeout(timeout);
		}
	} catch {
		return undefined;
	}
}
