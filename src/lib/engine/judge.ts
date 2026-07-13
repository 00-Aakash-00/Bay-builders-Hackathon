import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export async function oneShot<T>(opts: {
	system: string;
	user: string;
	schema: z.ZodType<T>;
	model: "claude-sonnet-5" | "claude-haiku-4-5";
}): Promise<T> {
	const stream = query({
		prompt: opts.user,
		options: {
			model: opts.model,
			systemPrompt: opts.system,
			tools: [],
			allowedTools: [],
			settingSources: [],
			strictMcpConfig: true,
			permissionMode: "dontAsk",
			maxTurns: 1,
			persistSession: false,
			stderr: (data: string) => {
				const text = String(data).trim();
				if (text) console.error("[claude-stderr]", text.slice(0, 600));
			},
			outputFormat: {
				type: "json_schema",
				schema: z.toJSONSchema(opts.schema, { target: "draft-7" }),
			},
		},
	});

	let result: { value: T } | undefined;
	let failure: string | undefined;
	try {
		for await (const message of stream) {
			if (message.type !== "result") continue;
			if (message.subtype === "success") {
				result = { value: opts.schema.parse(message.structured_output) };
			} else {
				failure = message.errors.join("; ") || message.subtype;
			}
		}
	} finally {
		try {
			stream.close();
		} catch {
			// already terminated
		}
	}

	if (failure) throw new Error(failure);
	if (!result)
		throw new Error("Claude one-shot ended without structured output");
	return result.value;
}
