import { getRun, triggerRadar } from "@/lib/run-store";

export async function POST(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	if (!getRun(id)) {
		return Response.json({ error: "Run not found" }, { status: 404 });
	}

	const lead = triggerRadar(id);
	return Response.json({ ok: true, leadId: lead?.id });
}
