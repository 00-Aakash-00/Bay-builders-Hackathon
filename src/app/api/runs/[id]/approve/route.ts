import { approveLead, getRun } from "@/lib/run-store";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	if (!getRun(id)) {
		return Response.json({ error: "Run not found" }, { status: 404 });
	}

	const body: unknown = await request.json().catch(() => undefined);
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return Response.json({ error: "Invalid request body" }, { status: 400 });
	}

	const leadId = (body as Record<string, unknown>).leadId;
	if (typeof leadId !== "string" || leadId.trim().length === 0) {
		return Response.json({ error: "leadId is required" }, { status: 400 });
	}

	const draft = approveLead(id, leadId);
	if (!draft) {
		return Response.json({ error: "Lead draft not found" }, { status: 404 });
	}

	return Response.json({ ok: true, status: draft.status });
}
