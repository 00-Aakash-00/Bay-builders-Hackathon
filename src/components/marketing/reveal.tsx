"use client";

import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useRef,
	useState,
} from "react";
import styles from "./marketing.module.css";

type RevealProps = {
	children: ReactNode;
	className?: string;
	delay?: number;
};

export function Reveal({ children, className = "", delay = 0 }: RevealProps) {
	const elementRef = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const element = elementRef.current;

		if (!element) {
			return;
		}

		if (!("IntersectionObserver" in window)) {
			setIsVisible(true);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					setIsVisible(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "0px 0px -80px 0px", threshold: 0.1 },
		);

		observer.observe(element);

		return () => observer.disconnect();
	}, []);

	const revealStyle = {
		"--reveal-delay": `${delay}ms`,
	} as CSSProperties;

	return (
		<div
			className={[styles.reveal, isVisible && styles.revealVisible, className]
				.filter(Boolean)
				.join(" ")}
			ref={elementRef}
			style={revealStyle}
		>
			{children}
		</div>
	);
}
