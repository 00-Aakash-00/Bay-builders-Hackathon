import { LeadCard } from "customerzero";
import { sampleDraft, sampleLead } from "../assets/fixtures";

const noop = async () => {};

export function WithGroundedDraft() {
	return (
		<div style={{ maxWidth: 560 }}>
			<LeadCard
				lead={sampleLead}
				draft={sampleDraft}
				isSent={false}
				onApprove={noop}
			/>
		</div>
	);
}

export function Sent() {
	return (
		<div style={{ maxWidth: 560 }}>
			<LeadCard
				lead={sampleLead}
				draft={sampleDraft}
				isSent={true}
				onApprove={noop}
			/>
		</div>
	);
}
