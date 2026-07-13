import { SwarmFeed } from "customerzero";
import { huntEvents } from "../assets/fixtures";

export function LiveAuditTrail() {
	return (
		<div style={{ maxWidth: 560 }}>
			<SwarmFeed events={huntEvents} />
		</div>
	);
}
