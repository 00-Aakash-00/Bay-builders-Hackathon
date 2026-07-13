import { DitherPhoto } from "customerzero";
import proofDither from "../assets/brand-dithered/proof.png";
import signalDither from "../assets/brand-dithered/signal.png";

export function OnLightSubject() {
	return (
		<div
			style={{
				width: 480,
				height: 260,
				overflow: "hidden",
				borderRadius: 2,
				background: "#0b0d12",
			}}
		>
			<DitherPhoto image={proofDither} className="h-full w-full" />
		</div>
	);
}

export function FooterTreatment() {
	return (
		<div
			style={{
				width: 480,
				height: 260,
				overflow: "hidden",
				borderRadius: 2,
				background: "#0b0d12",
			}}
		>
			<DitherPhoto
				image={signalDither}
				inverted={false}
				className="h-full w-full"
			/>
		</div>
	);
}
