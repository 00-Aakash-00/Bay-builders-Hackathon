import { ReceiptCard } from "customerzero";

export function VerifiedReceipt() {
	return (
		<div style={{ maxWidth: 460 }}>
			<ReceiptCard
				stage="problem aware"
				name="Rina Patel"
				persona="Head of Customer Success"
				company="Pylonworks"
				quote="We lose the why behind customer requests between calls and the roadmap. I need the evidence attached."
				source="github.com/pylonworks/feedback/issues/184"
				dateTime="2026-07-11"
				date="July 11, 2026"
				score="82"
			/>
		</div>
	);
}

export function RejectedSignal() {
	return (
		<div style={{ maxWidth: 460 }}>
			<ReceiptCard
				rejected
				stage="trigger present"
				name="Tom Becker"
				persona="Founder"
				company="RelayDesk"
				quote="Looking for a better way to find early design partners this month."
				source="reddit.com/r/SaaS/comments/1m2cq9"
				dateTime="2026-07-09"
				date="July 9, 2026"
				score="—"
			/>
		</div>
	);
}
