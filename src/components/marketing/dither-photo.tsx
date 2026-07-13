"use client";

import dynamic from "next/dynamic";

const ImageDithering = dynamic(
	() => import("@paper-design/shaders-react").then((mod) => mod.ImageDithering),
	{ ssr: false },
);

type DitherPhotoProps = {
	image: string;
	className?: string;
	colorBack?: string;
	colorFront?: string;
	colorHighlight?: string;
	colorSteps?: number;
	size?: number;
	inverted?: boolean;
};

export function DitherPhoto({
	image,
	className,
	colorBack = "#0b0d12",
	colorFront = "#cdd4f7",
	colorHighlight = "#ffffff",
	colorSteps = 2,
	size = 3,
	inverted = true,
}: DitherPhotoProps) {
	return (
		<ImageDithering
			className={className}
			colorBack={colorBack}
			colorFront={colorFront}
			colorHighlight={colorHighlight}
			colorSteps={colorSteps}
			fit="cover"
			image={image}
			inverted={inverted}
			size={size}
			speed={0}
			style={{ height: "100%", width: "100%" }}
			type="4x4"
		/>
	);
}
