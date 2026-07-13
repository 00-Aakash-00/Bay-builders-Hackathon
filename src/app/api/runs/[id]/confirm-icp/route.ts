import { confirmIcp, getRun } from "@/lib/run-store";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const run = getRun(id);
	if (!run) {
		return Response.json({ error: "Run not found" }, { status: 404 });
	}

	const body: unknown = await request.json().catch(() => undefined);
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const value = (body as Record<string, unknown>).icpId;
	const icpId = typeof value === "string" ? value.trim() : "";
	if (!icpId) {
		return Response.json({ error: "icpId is required" }, { status: 400 });
	}
	if (!confirmIcp(id, icpId)) {
		return Response.json(
			{ error: "Run is not waiting for this ICP confirmation" },
			{ status: 409 },
		);
	}

	return Response.json({ ok: true });
}
