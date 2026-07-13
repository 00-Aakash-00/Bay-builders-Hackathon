"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type RunDepth = 5 | 10 | 20;

function normalizeHttpUrl(value: string) {
	const trimmedValue = value.trim();
	const valueWithScheme = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmedValue)
		? trimmedValue
		: `https://${trimmedValue}`;

	try {
		const url = new URL(valueWithScheme);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		return url.toString();
	} catch {
		return null;
	}
}

export function RunCreationForm() {
	const router = useRouter();
	const [domain, setDomain] = useState("");
	const [depth, setDepth] = useState<RunDepth>(10);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const normalizedDomain = normalizeHttpUrl(domain);

		if (!normalizedDomain) {
			setError("Enter a valid startup URL.");
			return;
		}

		setError(null);
		setIsSubmitting(true);

		try {
			const response = await fetch("/api/runs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ domain: normalizedDomain, depth }),
			});
			const result: unknown = await response.json();

			if (
				!response.ok ||
				typeof result !== "object" ||
				result === null ||
				!("id" in result) ||
				typeof result.id !== "string"
			) {
				throw new Error("Run creation failed");
			}

			router.push(`/app/runs/${encodeURIComponent(result.id)}`);
		} catch {
			setError("The run could not be created. Please try again.");
			setIsSubmitting(false);
		}
	}

	return (
		<section className="w-full max-w-xl rounded-sm border border-mist bg-white p-24 shadow-sm sm:p-40">
			<div className="mb-32">
				<p className="mb-8 text-caption uppercase tracking-widest text-steel">
					New run
				</p>
				<h1 className="font-fraktion text-heading tracking-tight">
					Point me at your startup.
				</h1>
				<p className="mt-8 max-w-md text-body-sm text-iron">
					We will turn one public product page into a testable customer
					hypothesis.
				</p>
			</div>

			<form className="space-y-24" onSubmit={handleSubmit} noValidate>
				<div>
					<label
						className="mb-8 block text-caption font-medium text-graphite"
						htmlFor="domain"
					>
						Startup URL
					</label>
					<input
						id="domain"
						name="domain"
						type="url"
						inputMode="url"
						autoComplete="url"
						placeholder="https://yourstartup.com"
						value={domain}
						onChange={(event) => setDomain(event.target.value)}
						aria-invalid={error ? true : undefined}
						aria-describedby={error ? "domain-error" : undefined}
						className="w-full rounded-sm border border-mist bg-white px-16 py-16 text-body text-obsidian outline-none placeholder:text-fog focus-visible:border-ash focus-visible:ring-2 focus-visible:ring-ash"
					/>
					{error ? (
						<p id="domain-error" className="mt-8 text-caption text-iron">
							{error}
						</p>
					) : null}
				</div>

				<div>
					<label
						className="mb-8 block text-caption font-medium text-graphite"
						htmlFor="depth"
					>
						Run depth
					</label>
					<select
						id="depth"
						name="depth"
						value={depth}
						onChange={(event) =>
							setDepth(Number(event.target.value) as RunDepth)
						}
						className="w-full rounded-sm border border-mist bg-white px-16 py-16 text-body-sm text-obsidian outline-none focus-visible:border-ash focus-visible:ring-2 focus-visible:ring-ash"
					>
						<option value={5}>Quick · 5 leads</option>
						<option value={10}>Standard · 10 leads</option>
						<option value={20}>Deep · 20 leads</option>
					</select>
				</div>

				<button
					type="submit"
					disabled={isSubmitting}
					className="w-full rounded-sm bg-glacier-tint px-16 py-16 text-body-sm font-medium text-obsidian transition-transform duration-150 ease-out-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100"
				>
					{isSubmitting ? "Starting the swarm…" : "Find my customers"}
				</button>
			</form>
		</section>
	);
}
