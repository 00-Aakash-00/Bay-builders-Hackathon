const chatIdsByRun = new Map<string, string>();

interface BandCreateChatResponse {
	data?: {
		id?: string;
	};
}

export async function postToRoom(runId: string, text: string): Promise<void> {
	const apiKey = process.env.BAND_API_KEY;
	if (!apiKey) {
		console.info(`[band] Simulated post for run ${runId}: ${text}`);
		return;
	}
	const participantId = process.env.BAND_PARTICIPANT_ID;
	const participantHandle = process.env.BAND_PARTICIPANT_HANDLE;
	if (!participantId || !participantHandle) {
		console.warn(
			`[band] Simulated post for run ${runId}; BAND participant configuration is incomplete.`,
		);
		return;
	}

	try {
		let chatId = chatIdsByRun.get(runId);
		if (!chatId) {
			// TODO-verify: confirm participant IDs/handles with the sponsor-issued BAND account.
			const response = await fetch("https://app.band.ai/api/v1/agent/chats", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": apiKey,
				},
				body: JSON.stringify({
					chat: { title: `CustomerZero run ${runId}` },
				}),
				signal: AbortSignal.timeout(15_000),
			});
			if (!response.ok) {
				throw new Error(`BAND chat creation returned ${response.status}`);
			}

			const payload = (await response.json()) as BandCreateChatResponse;
			chatId = payload.data?.id;
			if (!chatId) {
				throw new Error("BAND chat creation response did not include an id");
			}
			const participantResponse = await fetch(
				`https://app.band.ai/api/v1/agent/chats/${chatId}/participants`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-API-Key": apiKey,
					},
					body: JSON.stringify({
						participant: { participant_id: participantId, role: "member" },
					}),
					signal: AbortSignal.timeout(15_000),
				},
			);
			if (!participantResponse.ok) {
				throw new Error(
					`BAND participant add returned ${participantResponse.status}`,
				);
			}
			chatIdsByRun.set(runId, chatId);
		}

		// TODO-verify: confirm the mention fields with the sponsor-issued BAND account.
		const response = await fetch(
			`https://app.band.ai/api/v1/agent/chats/${chatId}/messages`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-API-Key": apiKey,
				},
				body: JSON.stringify({
					message: {
						content: `@${participantHandle} ${text}`,
						mentions: [
							{
								id: participantId,
								handle: participantHandle,
								name: process.env.BAND_PARTICIPANT_NAME ?? participantHandle,
							},
						],
					},
				}),
				signal: AbortSignal.timeout(15_000),
			},
		);
		if (!response.ok) {
			throw new Error(`BAND message post returned ${response.status}`);
		}
	} catch (error) {
		console.warn(
			`[band] Failed to post for run ${runId}`,
			error instanceof Error ? error.message : error,
		);
	}
}
