"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export function HeroImage() {
	const imageRef = useRef<HTMLImageElement>(null);
	const [status, setStatus] = useState<"loading" | "loaded" | "error">(
		"loading",
	);

	useEffect(() => {
		const image = imageRef.current;

		if (image?.complete) {
			setStatus(image.naturalWidth > 0 ? "loaded" : "error");
		}
	}, []);

	if (status === "error") {
		return null;
	}

	return (
		<Image
			alt=""
			className={`object-cover ${status === "loaded" ? "opacity-100" : "opacity-0"}`}
			fill
			loading="eager"
			onError={() => setStatus("error")}
			onLoad={() => setStatus("loaded")}
			ref={imageRef}
			sizes="(max-width: 1024px) 100vw, 50vw"
			src="/brand/hero.webp"
			unoptimized
		/>
	);
}
