import { createRun, type RunDepth } from "@/lib/run-store";

const depths: RunDepth[] = [5, 10, 20];

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

export async function POST(request: Request) {
	const body: unknown = await request.json().catch(() => undefined);
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const input = body as Record<string, unknown>;
	const domain = typeof input.domain === "string" ? input.domain.trim() : "";
	const depth = input.depth ?? 10;
	if (!isHttpUrl(domain)) {
		return Response.json(
			{ error: "Domain must be a valid http(s) URL" },
			{ status: 400 },
		);
	}
	if (typeof depth !== "number" || !depths.includes(depth as RunDepth)) {
		return Response.json(
			{ error: "Depth must be 5, 10, or 20" },
			{ status: 400 },
		);
	}

	const run = createRun(domain, depth as RunDepth);
	return Response.json({ id: run.id }, { status: 201 });
}
