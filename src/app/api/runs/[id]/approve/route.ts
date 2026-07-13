import { proxyWorkerPost } from "@/lib/worker-client";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	return proxyWorkerPost(request, `/runs/${encodeURIComponent(id)}/approve`);
}
