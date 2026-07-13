const DEFAULT_MATCH_THRESHOLD = 0.8;

export function normalizeEvidenceText(value: string): string {
	return value
		.normalize("NFKD")
		.toLocaleLowerCase("en-US")
		.replace(/\p{Mark}/gu, "")
		.replace(/[^\p{Letter}\p{Number}]+/gu, " ")
		.trim()
		.replace(/\s+/gu, " ");
}

function orderedTokenSimilarity(left: string[], right: string[]): number {
	let previous = new Array<number>(right.length + 1).fill(0);
	for (const leftToken of left) {
		const current = new Array<number>(right.length + 1).fill(0);
		for (let index = 1; index <= right.length; index += 1) {
			current[index] =
				leftToken === right[index - 1]
					? previous[index - 1] + 1
					: Math.max(previous[index], current[index - 1]);
		}
		previous = current;
	}

	return (2 * previous[right.length]) / (left.length + right.length);
}

export function quoteMatchScore(quote: string, pageContent: string): number {
	const normalizedQuote = normalizeEvidenceText(quote);
	const normalizedPage = normalizeEvidenceText(pageContent);
	if (!normalizedQuote || !normalizedPage) {
		return 0;
	}

	const quoteTokens = normalizedQuote.split(" ");
	const pageTokens = normalizedPage.split(" ");
	if (quoteTokens.length < 4 || pageTokens.length < quoteTokens.length * 0.8) {
		return 0;
	}
	if (normalizedPage.includes(normalizedQuote)) {
		return 1;
	}

	const minimumWindow = Math.max(4, Math.floor(quoteTokens.length * 0.8));
	const maximumWindow = Math.min(
		pageTokens.length,
		Math.ceil(quoteTokens.length * 1.2),
	);
	let best = 0;
	for (let size = minimumWindow; size <= maximumWindow; size += 1) {
		for (let start = 0; start + size <= pageTokens.length; start += 1) {
			best = Math.max(
				best,
				orderedTokenSimilarity(
					quoteTokens,
					pageTokens.slice(start, start + size),
				),
			);
			if (best >= 1) {
				return 1;
			}
		}
	}

	return best;
}

export function quoteMatches(
	quote: string,
	pageContent: string,
	threshold = DEFAULT_MATCH_THRESHOLD,
): boolean {
	return quoteMatchScore(quote, pageContent) >= threshold;
}
