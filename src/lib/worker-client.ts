const workerOrigin =
	process.env.WORKER_ORIGIN ||
	`http://127.0.0.1:${process.env.WORKER_PORT || 8787}`;

export function engineWorkerUrl(pathname: string): URL {
	return new URL(pathname, workerOrigin);
}

export function workerOfflineResponse(): Response {
	return Response.json(
		{ error: "engine worker offline — run `pnpm worker`" },
		{ status: 503 },
	);
}

export async function proxyWorkerGet(
	request: Request,
	pathname: string,
): Promise<Response> {
	let upstream: Response;
	try {
		upstream = await fetch(engineWorkerUrl(pathname), {
			method: "GET",
			cache: "no-store",
			signal: request.signal,
		});
	} catch (error) {
		if (request.signal.aborted) throw error;
		return workerOfflineResponse();
	}

	const upstreamContentType = upstream.headers.get("content-type");
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		...(upstreamContentType
			? { headers: { "Content-Type": upstreamContentType } }
			: {}),
	});
}

export async function proxyWorkerPost(
	request: Request,
	pathname: string,
): Promise<Response> {
	const contentType = request.headers.get("content-type");
	const body = await request.arrayBuffer();
	let upstream: Response;
	try {
		upstream = await fetch(engineWorkerUrl(pathname), {
			method: "POST",
			...(contentType ? { headers: { "Content-Type": contentType } } : {}),
			body,
			cache: "no-store",
			signal: request.signal,
		});
	} catch (error) {
		if (request.signal.aborted) throw error;
		return workerOfflineResponse();
	}

	const upstreamContentType = upstream.headers.get("content-type");
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		...(upstreamContentType
			? { headers: { "Content-Type": upstreamContentType } }
			: {}),
	});
}
