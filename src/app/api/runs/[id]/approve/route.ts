import { sendEmail } from "@/lib/engine/tools/kylon";
import { append, approveLead, getRun } from "@/lib/run-store";
import { RunEventSchema } from "@/lib/schemas";

const globalForApprovals = globalThis as typeof globalThis & {
	customerZeroApprovalLocks?: Map<string, Promise<void>>;
};
const approvalLocks =
	globalForApprovals.customerZeroApprovalLocks ??
	new Map<string, Promise<void>>();
globalForApprovals.customerZeroApprovalLocks = approvalLocks;

async function withApprovalLock<T>(key: string, task: () => Promise<T>) {
	const previous = approvalLocks.get(key) ?? Promise.resolve();
	let release = () => {};
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	approvalLocks.set(key, current);
	await previous;
	try {
		return await task();
	} finally {
		release();
		if (approvalLocks.get(key) === current) approvalLocks.delete(key);
	}
}

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

	const leadId = (body as Record<string, unknown>).leadId;
	if (typeof leadId !== "string" || leadId.trim().length === 0) {
		return Response.json({ error: "leadId is required" }, { status: 400 });
	}
	return withApprovalLock(`${id}:${leadId}`, async () => {
		const currentRun = getRun(id);
		const lead = currentRun?.leads.get(leadId);
		const storedDraft = currentRun?.drafts.get(leadId);
		if (!currentRun || !lead || !storedDraft) {
			return Response.json({ error: "Lead draft not found" }, { status: 404 });
		}
		if (storedDraft.status === "sent") {
			return Response.json({ ok: true, status: storedDraft.status });
		}

		const publicEmail =
			lead.enrichment.contacts?.find(
				(contact) => contact.kind === "public_email",
			)?.value ??
			(lead.enrichment.channel.kind === "public_email"
				? lead.enrichment.channel.value
				: undefined);
		const sendResult = await sendEmail({
			...(publicEmail ? { to: publicEmail } : {}),
			body: storedDraft.body,
			...(storedDraft.subject ? { subject: storedDraft.subject } : {}),
		});
		const event = RunEventSchema.parse({
			runId: id,
			ts: new Date().toISOString(),
			seq: (currentRun.events.at(-1)?.seq ?? 0) + 1,
			lane: "composer",
			type: sendResult.successful ? "tool_call" : "error",
			payload: sendResult.successful
				? {
						tool: "kylon_send_email",
						action: sendResult.simulated
							? `Simulated approved send for ${leadId}`
							: `Sent email for ${leadId}`,
					}
				: {
						message: sendResult.error ?? "Kylon email send failed",
						recoverable: true,
					},
		});
		append(id, event);
		if (!sendResult.successful) {
			return Response.json(
				{ error: sendResult.error ?? "Email send failed" },
				{ status: publicEmail ? 502 : 422 },
			);
		}

		const draft = approveLead(id, leadId);
		if (!draft) {
			return Response.json({ error: "Lead draft not found" }, { status: 404 });
		}

		return Response.json({
			ok: true,
			status: draft.status,
			simulated: sendResult.simulated,
		});
	});
}
