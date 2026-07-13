import { proxyWorkerPost } from "@/lib/worker-client";

export async function POST(request: Request) {
	return proxyWorkerPost(request, "/runs");
}
