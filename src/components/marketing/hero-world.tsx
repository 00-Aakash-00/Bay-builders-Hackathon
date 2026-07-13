"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const CLIP = "/brand/vid/hero.mp4";
const CLIP_MOBILE = "/brand/vid/hero-m.mp4";
const POSTER = "/brand/hero.webp";

export function HeroWorld() {
	const sectionRef = useRef<HTMLElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const pendingTime = useRef<number | null>(null);
	const [reduced, setReduced] = useState(false);
	const [painted, setPainted] = useState(false);
	const [dismissed, setDismissed] = useState(false);

	useEffect(() => {
		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		setReduced(mq.matches);
		const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	useEffect(() => {
		if (reduced) {
			return;
		}
		const section = sectionRef.current;
		const video = videoRef.current;
		if (!section || !video) {
			return;
		}

		const isMobile = window.matchMedia(
			"(hover: none) and (pointer: coarse), (max-width: 860px)",
		).matches;
		const source = isMobile ? CLIP_MOBILE : CLIP;
		if (video.src !== new URL(source, window.location.href).href) {
			video.src = source;
			video.load();
		}

		const seekTo = (time: number) => {
			if (video.seeking) {
				pendingTime.current = time;
				return;
			}
			pendingTime.current = null;
			video.currentTime = time;
		};

		const onSeeked = () => {
			setPainted(true);
			if (pendingTime.current !== null) {
				const next = pendingTime.current;
				pendingTime.current = null;
				video.currentTime = next;
			}
		};

		let rafId = 0;
		const onScroll = () => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				const rect = section.getBoundingClientRect();
				const runway = rect.height - window.innerHeight;
				if (runway <= 0) {
					return;
				}
				const progress = Math.min(1, Math.max(0, -rect.top / runway));
				setDismissed(progress > 0.3);
				if (Number.isFinite(video.duration) && video.duration > 0) {
					seekTo(progress * (video.duration - 0.05));
				}
			});
		};

		video.addEventListener("seeked", onSeeked);
		window.addEventListener("scroll", onScroll, { passive: true });
		onScroll();
		return () => {
			cancelAnimationFrame(rafId);
			video.removeEventListener("seeked", onSeeked);
			window.removeEventListener("scroll", onScroll);
		};
	}, [reduced]);

	const copy = (
		<div
			className={`max-w-md transition-[opacity,transform] duration-[240ms] ease-out-strong motion-reduce:transition-none ${
				dismissed && !reduced
					? "pointer-events-none -translate-y-[10px] opacity-0"
					: "translate-y-0 opacity-100"
			}`}
		>
			<p className="text-caption font-semibold uppercase tracking-[0.16em] text-iron">
				The gauntlet
			</p>
			<h2 className="mt-16 font-fraktion text-heading font-semibold text-obsidian">
				Follow one thread until it proves out.
			</h2>
			<p className="mt-16 text-body-sm text-iron">
				Every verified lead is a thread pinned to a source. The swarm builds the
				board; the verifier decides what stays on it.
			</p>
			<Link
				className="mt-24 inline-flex rounded-sm bg-glacier-tint px-24 py-16 text-body-sm font-semibold text-obsidian shadow-sm transition-transform duration-[160ms] ease-out-strong hover:shadow-sm-2 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-obsidian"
				href="/app"
			>
				Find my customers
			</Link>
		</div>
	);

	if (reduced) {
		return (
			<section aria-label="Evidence flight" className="border-b border-mist">
				<div className="relative">
					{/* biome-ignore lint/performance/noImgElement: full-bleed poster fallback */}
					<img alt="" className="h-[70vh] w-full object-cover" src={POSTER} />
					<div className="absolute inset-0 flex items-center">
						<div className="mx-auto w-full max-w-7xl px-16 sm:px-24 lg:px-32">
							{copy}
						</div>
					</div>
				</div>
			</section>
		);
	}

	return (
		<section
			aria-label="Evidence flight"
			className="relative h-[240vh] border-b border-mist bg-paper"
			ref={sectionRef}
		>
			<div className="sticky top-0 h-screen overflow-hidden">
				{/* biome-ignore lint/performance/noImgElement: poster stays live until the clip paints */}
				<img
					alt=""
					aria-hidden="true"
					className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[240ms] ease-out-strong ${painted ? "opacity-0" : "opacity-100"}`}
					src={POSTER}
				/>
				<video
					className="absolute inset-0 h-full w-full object-cover"
					muted
					playsInline
					preload="auto"
					ref={videoRef}
					tabIndex={-1}
				/>
				<div className="absolute inset-0 flex items-center">
					<div className="mx-auto w-full max-w-7xl px-16 sm:px-24 lg:px-32">
						{copy}
					</div>
				</div>
			</div>
		</section>
	);
}
