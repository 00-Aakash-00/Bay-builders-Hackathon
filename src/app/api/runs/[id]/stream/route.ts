import { getRun, subscribe } from "@/lib/run-store";

const encoder = new TextEncoder();

function parseLastEventId(request: Request): number {
	const value = Number.parseInt(
		request.headers.get("last-event-id") ?? "0",
		10,
	);
	return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	if (!getRun(id)) {
		return Response.json({ error: "Run not found" }, { status: 404 });
	}

	let cleanup = () => {};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			let active = true;
			const unsubscribe = subscribe(id, parseLastEventId(request), (event) => {
				controller.enqueue(
					encoder.encode(
						`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`,
					),
				);
			});
			const heartbeat = setInterval(() => {
				controller.enqueue(encoder.encode(": heartbeat\n\n"));
			}, 15_000);

			const dispose = () => {
				if (!active) {
					return;
				}
				active = false;
				clearInterval(heartbeat);
				unsubscribe();
				request.signal.removeEventListener("abort", abort);
			};
			const abort = () => {
				dispose();
				controller.close();
			};

			cleanup = dispose;
			if (request.signal.aborted) {
				abort();
			} else {
				request.signal.addEventListener("abort", abort, { once: true });
			}
		},
		cancel() {
			cleanup();
		},
	});

	return new Response(stream, {
		headers: {
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"Content-Type": "text/event-stream; charset=utf-8",
			"X-Accel-Buffering": "no",
		},
	});
}
