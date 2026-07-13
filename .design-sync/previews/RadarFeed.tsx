import { RadarFeed } from "customerzero";
import { radarLeads } from "../assets/fixtures";

export function WithAlerts() {
	return (
		<div style={{ maxWidth: 560 }}>
			<RadarFeed runId="run_demo" alerts={radarLeads} />
		</div>
	);
}

export function Empty() {
	return (
		<div style={{ maxWidth: 560 }}>
			<RadarFeed runId="run_demo" alerts={[]} />
		</div>
	);
}
