import { CandidateTracker } from "customerzero";
import { huntEvents } from "../assets/fixtures";

const noop = () => {};

export function TheGauntlet() {
	return (
		<div style={{ maxWidth: 520 }}>
			<CandidateTracker
				events={huntEvents}
				dismissedRejections={new Set()}
				onDismissRejected={noop}
				runState="HUNTING"
			/>
		</div>
	);
}
