export interface KylonEmailDraft {
	to?: string;
	subject?: string;
	body: string;
}

export interface KylonSendResult {
	simulated: boolean;
	successful: boolean;
	data?: unknown;
	error?: string;
}

interface KylonResponse {
	successful?: boolean;
	data?: unknown;
	error?: unknown;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export async function sendEmail(
	draft: KylonEmailDraft,
): Promise<KylonSendResult> {
	const apiKey = process.env.KYLON_PAK_KEY;
	if (!apiKey) {
		return { simulated: true, successful: true };
	}
	if (!draft.to || !EMAIL_PATTERN.test(draft.to)) {
		return {
			simulated: false,
			successful: false,
			error: "No valid public email is available for this lead",
		};
	}

	try {
		// TODO-verify: confirm the Gmail argument names with a sponsor-issued Kylon key.
		const response = await fetch("https://api.kylon.io/proxy/tools/execute", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify({
				tool: "GMAIL_SEND_EMAIL",
				arguments: {
					to: draft.to,
					subject: draft.subject ?? "",
					body: draft.body,
				},
			}),
			signal: AbortSignal.timeout(15_000),
		});

		let data: unknown;
		try {
			data = await response.json();
		} catch {
			data = undefined;
		}

		if (!response.ok) {
			return {
				simulated: false,
				successful: false,
				data,
				error: `Kylon send returned ${response.status}`,
			};
		}

		const result = data as KylonResponse | undefined;
		if (result?.successful !== true) {
			return {
				simulated: false,
				successful: false,
				data,
				error:
					typeof result?.error === "string"
						? result.error
						: "Kylon did not confirm a successful send",
			};
		}

		return { simulated: false, successful: true, data };
	} catch (error) {
		return {
			simulated: false,
			successful: false,
			error: error instanceof Error ? error.message : "Kylon send failed",
		};
	}
}
