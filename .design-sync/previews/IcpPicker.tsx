import { IcpPicker } from "customerzero";
import { sampleBrief, sampleIcps } from "../assets/fixtures";

const confirm = async () => true;

export function ChooseHypothesis() {
	return (
		<div style={{ maxWidth: 620 }}>
			<IcpPicker
				brief={sampleBrief}
				icps={sampleIcps}
				confirmedIcp={null}
				onConfirm={confirm}
			/>
		</div>
	);
}
