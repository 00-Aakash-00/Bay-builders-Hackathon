"use client";

import Script from "next/script";
import { type CSSProperties, useCallback, useEffect, useRef } from "react";

type ScrollWorldConfig = Record<string, unknown>;

declare global {
	interface Window {
		mountScrollWorld?: (el: HTMLElement, config: ScrollWorldConfig) => void;
	}
}

const CONFIG: ScrollWorldConfig = {
	nav: false,
	atmosphere: false,
	hint: "scroll — follow the thread",
	diveScroll: 1.6,
	sections: [
		{
			id: "evidence-flight",
			label: "The gauntlet",
			still: "/brand/hero.webp",
			clip: "/brand/vid/hero.mp4",
			clipMobile: "/brand/vid/hero-m.mp4",
			accent: "#e2e7fc",
			linger: 0.35,
			eyebrow: "The gauntlet",
			title: "Follow one thread until it proves out.",
			body: "Every verified lead is a thread pinned to a source. Scroll — the camera flies into the board the swarm builds for you.",
			cta: {
				primary: { label: "Find my customers", href: "/app" },
			},
		},
	],
	connectors: [],
};

const THEME_VARS = {
	"--sw-bg": "var(--color-paper)",
	"--sw-ink": "var(--color-obsidian)",
	"--sw-ink-soft": "var(--color-iron)",
	"--sw-accent": "var(--color-glacier-tint)",
	"--sw-font-display": "var(--font-fraktion)",
	"--sw-font-body": "var(--font-inter)",
} as CSSProperties;

export function HeroWorld() {
	const containerRef = useRef<HTMLDivElement>(null);
	const mountedRef = useRef(false);

	const mount = useCallback(() => {
		const el = containerRef.current;
		if (!el || mountedRef.current || !window.mountScrollWorld) {
			return;
		}
		mountedRef.current = true;
		window.mountScrollWorld(el, CONFIG);
	}, []);

	useEffect(() => {
		mount();
	}, [mount]);

	return (
		<>
			<Script
				onLoad={mount}
				src="/scroll-world/scrub-engine.js"
				strategy="afterInteractive"
			/>
			<div ref={containerRef} style={THEME_VARS} />
		</>
	);
}
