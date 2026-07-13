import type { Enrichment } from "@/lib/schemas";
import { extractTavily, searchTavily } from "./tools/tavily";
import { searchYouCom } from "./tools/youcom";

type Contacts = NonNullable<Enrichment["contacts"]>;
type Datapoints = NonNullable<Enrichment["datapoints"]>;

const NON_COMPANY_HOSTS = [
	"github.com",
	"g2.com",
	"linkedin.com",
	"medium.com",
	"news.ycombinator.com",
	"producthunt.com",
	"reddit.com",
	"substack.com",
	"twitter.com",
	"x.com",
] as const;

const COMPANY_STOPWORDS = new Set([
	"company",
	"corp",
	"corporation",
	"group",
	"inc",
	"labs",
	"llc",
	"limited",
	"ltd",
	"the",
]);

const PLACEHOLDER_EMAIL_DOMAINS = new Set([
	"example.com",
	"example.net",
	"example.org",
	"test.com",
]);

function httpUrl(value: string): URL | undefined {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:"
			? url
			: undefined;
	} catch {
		return undefined;
	}
}

function normalized(value: string): string {
	return value
		.normalize("NFKD")
		.toLocaleLowerCase("en-US")
		.replace(/\p{Mark}/gu, "")
		.replace(/[^a-z0-9]+/gu, " ")
		.trim();
}

function isCompanyHost(url: URL): boolean {
	const hostname = url.hostname.replace(/^www\./u, "");
	return !NON_COMPANY_HOSTS.some(
		(host) => hostname === host || hostname.endsWith(`.${host}`),
	);
}

function companyTokens(company: string): string[] {
	return normalized(company)
		.split(" ")
		.filter((token) => token.length > 2 && !COMPANY_STOPWORDS.has(token));
}

function hostMatchesCompany(company: string, url: URL): boolean {
	const tokens = companyTokens(company);
	if (tokens.length === 0) return false;
	const host = normalized(url.hostname.replace(/^www\./u, ""));
	const compactHost = host.replaceAll(" ", "");
	return (
		tokens.every((token) => host.includes(token)) ||
		compactHost.includes(tokens.join(""))
	);
}

function textMatchesCompany(company: string, value: string): boolean {
	const tokens = companyTokens(company);
	const haystack = normalized(value);
	return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

function resultMatchesCompany(
	company: string,
	result: { title: string; url: string; content: string },
): boolean {
	const url = httpUrl(result.url);
	if (!url || !isCompanyHost(url)) return false;
	return hostMatchesCompany(company, url);
}

async function discoverCompanyOrigin(
	runId: string,
	company: string | undefined,
	signalUrl: string,
): Promise<URL | undefined> {
	const signal = httpUrl(signalUrl);
	if (!company) {
		return signal && isCompanyHost(signal) ? new URL(signal.origin) : undefined;
	}
	if (signal && isCompanyHost(signal) && hostMatchesCompany(company, signal)) {
		return new URL(signal.origin);
	}

	try {
		const results = await searchTavily(runId, `"${company}" official site`, {
			maxResults: 5,
		});
		const result = results.find((candidate) =>
			resultMatchesCompany(company, candidate),
		);
		const url = result ? httpUrl(result.url) : undefined;
		return url ? new URL(url.origin) : undefined;
	} catch {
		return undefined;
	}
}

function cleanLines(rawContent: string): string[] {
	return rawContent
		.replace(/\r/gu, "")
		.split("\n")
		.map((line) =>
			line
				.replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
				.replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
				.replace(/<[^>]+>/gu, " ")
				.replace(/^\s{0,3}(?:#{1,6}|[-*+] |\d+[.)] )\s*/u, "")
				.replace(/[*_`~]/gu, "")
				.replace(/\s+/gu, " ")
				.trim(),
		)
		.filter(Boolean);
}

function wordCount(value: string): number {
	return value.split(/\s+/u).filter(Boolean).length;
}

function whatCompanyDoes(lines: string[]): string | undefined {
	const predicate =
		/\b(?:is|helps?|enables?|provides?|builds?|deploys?|automates?|connects?|platform|software|infrastructure)\b/iu;
	return lines.find((line) => {
		const words = wordCount(line);
		return (
			words >= 8 &&
			words <= 45 &&
			predicate.test(line) &&
			!/^(?:cookie|privacy|terms)\b/iu.test(line)
		);
	});
}

function roleLine(lines: string[], name: string): string | undefined {
	const nameTokens = normalized(name).split(" ").filter(Boolean);
	if (nameTokens.length === 0) return undefined;
	return lines.find(
		(line) =>
			wordCount(line) <= 30 &&
			nameTokens.every((token) => normalized(line).includes(token)) &&
			/\b(?:founder|co-founder|chief|CEO|CTO|COO|president|partner|director|head of|vice president|VP)\b/iu.test(
				line,
			),
	);
}

function locationLine(lines: string[]): string | undefined {
	return lines.find(
		(line) =>
			wordCount(line) >= 3 &&
			wordCount(line) <= 30 &&
			/\b(?:headquartered|based in|located in|office in|address:)\b/iu.test(
				line,
			),
	);
}

function publicEmail(value: string): string | undefined {
	const email = value.toLocaleLowerCase("en-US");
	const [local, domain] = email.split("@");
	if (
		!local ||
		!domain ||
		PLACEHOLDER_EMAIL_DOMAINS.has(domain) ||
		["email", "example", "name", "test", "user", "you", "yourname"].includes(
			local,
		) ||
		/\.(?:avif|css|gif|ico|jpe?g|js|png|svg|webp|woff2?)$/iu.test(domain)
	) {
		return undefined;
	}
	return email;
}

function profileKind(url: URL): "linkedin" | "github" | undefined {
	const hostname = url.hostname.replace(/^www\./u, "");
	if (hostname === "linkedin.com" && /^\/in\/[^/]+\/?$/u.test(url.pathname)) {
		return "linkedin";
	}
	if (
		hostname === "github.com" &&
		/^\/[^/]+\/?$/u.test(url.pathname) &&
		!/^\/(?:about|apps|collections|enterprise|features|marketplace|orgs|pricing|search|settings|sponsors|topics)\/?$/u.test(
			url.pathname,
		)
	) {
		return "github";
	}
	return undefined;
}

function resultMatchesPerson(
	name: string,
	company: string | undefined,
	result: { title: string; url: string; content: string },
): boolean {
	const nameParts = normalized(name).split(" ").filter(Boolean);
	const surname = nameParts.at(-1);
	if (!surname) return false;
	const url = httpUrl(result.url);
	if (!url) return false;
	const haystack = normalized(
		`${result.title} ${result.content} ${url.pathname}`,
	);
	const compact = haystack.replaceAll(" ", "");
	const nameMatches =
		haystack.includes(surname) &&
		(nameParts.every((part) => haystack.includes(part)) ||
			compact.includes(nameParts.join("")));
	return (
		nameMatches &&
		(!company ||
			textMatchesCompany(
				company,
				`${result.title} ${result.content} ${url.hostname}`,
			))
	);
}

function profileLinks(
	result: {
		title: string;
		url: string;
		content: string;
	},
	name: string,
): URL[] {
	const url = httpUrl(result.url);
	if (!url || !profileKind(url)) return [];
	const surname = normalized(name).split(" ").filter(Boolean).at(-1);
	const path = normalized(url.pathname).replaceAll(" ", "");
	return surname && path.includes(surname) ? [url] : [];
}

function recentNews(
	company: string,
	companyOrigin: URL | undefined,
	results: Awaited<ReturnType<typeof searchYouCom>>,
) {
	const now = Date.now();
	const oldest = now - 548 * 24 * 60 * 60 * 1_000;
	return results
		.filter((result) => {
			const url = httpUrl(result.url);
			const hostname = url?.hostname.replace(/^www\./u, "");
			const publishedAt = Date.parse(result.publishedDate ?? "");
			const sameCompanyHost =
				url && companyOrigin
					? url.hostname.replace(/^www\./u, "") ===
						companyOrigin.hostname.replace(/^www\./u, "")
					: false;
			const articlePath =
				url &&
				url.pathname !== "/" &&
				(!sameCompanyHost ||
					/\/(?:blog|news|press|stories?|updates?)\b/iu.test(url.pathname));
			return (
				url &&
				!result.synthetic &&
				Number.isFinite(publishedAt) &&
				publishedAt >= oldest &&
				publishedAt <= now + 24 * 60 * 60 * 1_000 &&
				articlePath &&
				!NON_COMPANY_HOSTS.some(
					(host) => hostname === host || hostname?.endsWith(`.${host}`),
				) &&
				textMatchesCompany(company, `${result.title} ${result.content}`)
			);
		})
		.toSorted(
			(left, right) =>
				Date.parse(right.publishedDate ?? "") -
				Date.parse(left.publishedDate ?? ""),
		)
		.at(0);
}

export async function enrichLead(
	partial: {
		name: string;
		company?: string;
		signalUrl: string;
		channelHint?: string;
	},
	budgetRunId?: string,
): Promise<{ contacts: Contacts; datapoints: Datapoints }> {
	const name = partial.name.trim();
	const company = partial.company?.trim() || undefined;
	const runId =
		budgetRunId ??
		`enrich:${normalized(`${name} ${company ?? partial.signalUrl}`)}`;
	const companyOrigin = await discoverCompanyOrigin(
		runId,
		company,
		partial.signalUrl,
	);
	const companyLabel = company ?? companyOrigin?.hostname;
	const companyPages = companyOrigin
		? [
				companyOrigin.href,
				new URL("/about", companyOrigin).href,
				new URL("/contact", companyOrigin).href,
			]
		: [];
	const personQuery = [
		`"${name}"`,
		company ? `"${company}"` : undefined,
		partial.channelHint?.trim() || undefined,
	]
		.filter(Boolean)
		.join(" ");
	const profileQuery = `${personQuery} (site:github.com OR site:linkedin.com/in)`;

	const [extracts, broadProfiles, profileVariants, newsResults] =
		await Promise.all([
			extractTavily(runId, companyPages).catch(() => []),
			searchTavily(runId, personQuery, { maxResults: 5 }).catch(() => []),
			searchTavily(runId, profileQuery, { maxResults: 5 }).catch(() => []),
			companyLabel && process.env.YDC_API_KEY
				? searchYouCom(`${companyLabel} news`, { count: 5 }).catch(() => [])
				: Promise.resolve([]),
		]);

	const contacts: Contacts = [];
	const datapoints: Datapoints = [];
	const contactKeys = new Set<string>();
	const datapointLabels = new Set<string>();
	const addContact = (contact: Contacts[number]) => {
		const key = `${contact.kind}:${contact.value}`;
		if (!contactKeys.has(key) && httpUrl(contact.provenanceUrl)) {
			contactKeys.add(key);
			contacts.push(contact);
		}
	};
	const addDatapoint = (datapoint: Datapoints[number]) => {
		if (
			datapoints.length < 6 &&
			!datapointLabels.has(datapoint.label) &&
			httpUrl(datapoint.provenanceUrl)
		) {
			datapointLabels.add(datapoint.label);
			datapoints.push(datapoint);
		}
	};

	for (const extract of extracts) {
		const pageUrl = httpUrl(extract.url);
		if (
			!pageUrl ||
			!extract.rawContent.trim() ||
			(companyOrigin &&
				pageUrl.hostname.replace(/^www\./u, "") !==
					companyOrigin.hostname.replace(/^www\./u, ""))
		) {
			continue;
		}
		const provenance = pageUrl.href;
		const pagePath = pageUrl.pathname.replace(/\/$/u, "") || "/";
		const isAboutPage = /\/about(?:\/|$)/iu.test(pagePath);
		const isContactPage = /\/contact(?:\/|$)/iu.test(pagePath);
		const lines = cleanLines(extract.rawContent);
		if (
			companyOrigin &&
			pagePath === (companyOrigin.pathname.replace(/\/$/u, "") || "/")
		) {
			addDatapoint({
				label: "Company website",
				value: provenance,
				kind: "url",
				provenanceUrl: provenance,
			});
			const description = whatCompanyDoes(lines);
			if (description) {
				addDatapoint({
					label: "What the company does",
					value: description,
					kind: "text",
					provenanceUrl: provenance,
				});
			}
		}

		for (const match of extract.rawContent.match(
			/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu,
		) ?? []) {
			const email = publicEmail(match);
			if (!email) continue;
			addContact({
				kind: "public_email",
				value: email,
				provenanceUrl: provenance,
			});
			addDatapoint({
				label: "Public email",
				value: email,
				kind: "text",
				provenanceUrl: provenance,
			});
		}

		const role = isAboutPage ? roleLine(lines, name) : undefined;
		if (role) {
			addDatapoint({
				label: "Role",
				value: role,
				kind: "text",
				provenanceUrl: provenance,
			});
		}
		const location =
			isAboutPage || isContactPage ? locationLine(lines) : undefined;
		if (location) {
			addDatapoint({
				label: "Location",
				value: location,
				kind: "text",
				provenanceUrl: provenance,
			});
		}
	}

	for (const result of [...broadProfiles, ...profileVariants]) {
		if (!resultMatchesPerson(name, company, result)) continue;
		for (const url of profileLinks(result, name)) {
			const kind = profileKind(url);
			if (kind) {
				addContact({
					kind,
					value: url.href,
					provenanceUrl: result.url,
				});
			}
		}
	}

	const news = companyLabel
		? recentNews(companyLabel, companyOrigin, newsResults)
		: undefined;
	if (news) {
		addDatapoint({
			label: "Recent news",
			value: news.title,
			kind: "text",
			provenanceUrl: news.url,
		});
	}

	return { contacts, datapoints };
}
