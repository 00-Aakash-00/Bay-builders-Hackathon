import { proxyWorkerGet, proxyWorkerPost } from "@/lib/worker-client";

export async function GET(request: Request) {
	return proxyWorkerGet(request, "/runs");
}

export async function POST(request: Request) {
	return proxyWorkerPost(request, "/runs");
}
