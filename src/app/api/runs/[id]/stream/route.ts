import { engineWorkerUrl, workerOfflineResponse } from "@/lib/worker-client";

export const runtime = "nodejs";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const url = engineWorkerUrl(`/runs/${encodeURIComponent(id)}/events`);
	url.search = new URL(request.url).search;
	const lastEventId = request.headers.get("last-event-id");
	const upstreamController = new AbortController();
	const abortUpstream = () => upstreamController.abort();
	if (request.signal.aborted) {
		abortUpstream();
	} else {
		request.signal.addEventListener("abort", abortUpstream, { once: true });
	}

	let upstream: Response;
	try {
		upstream = await fetch(url, {
			...(lastEventId === null
				? {}
				: { headers: { "Last-Event-ID": lastEventId } }),
			cache: "no-store",
			signal: upstreamController.signal,
		});
	} catch (error) {
		request.signal.removeEventListener("abort", abortUpstream);
		upstreamController.abort();
		if (request.signal.aborted) throw error;
		return workerOfflineResponse();
	}

	if (!upstream.ok || !upstream.body) {
		try {
			const body = await upstream.arrayBuffer();
			const contentType = upstream.headers.get("content-type");
			return new Response(body, {
				status: upstream.status,
				statusText: upstream.statusText,
				...(contentType ? { headers: { "Content-Type": contentType } } : {}),
			});
		} finally {
			request.signal.removeEventListener("abort", abortUpstream);
			upstreamController.abort();
		}
	}

	const reader = upstream.body.getReader();
	let disposed = false;
	const dispose = () => {
		if (disposed) return;
		disposed = true;
		request.signal.removeEventListener("abort", abortUpstream);
		upstreamController.abort();
	};
	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					dispose();
					controller.close();
					return;
				}
				controller.enqueue(value);
			} catch (error) {
				dispose();
				if (request.signal.aborted) {
					controller.close();
				} else {
					controller.error(error);
				}
			}
		},
		async cancel() {
			dispose();
			await reader.cancel().catch(() => undefined);
		},
	});

	return new Response(stream, {
		status: upstream.status,
		headers: {
			"Cache-Control":
				upstream.headers.get("cache-control") ?? "no-cache, no-transform",
			Connection: "keep-alive",
			"Content-Type":
				upstream.headers.get("content-type") ??
				"text/event-stream; charset=utf-8",
			"X-Accel-Buffering": upstream.headers.get("x-accel-buffering") ?? "no",
		},
	});
}
