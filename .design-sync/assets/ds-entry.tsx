// Off-script design-system entry: re-exports exactly the components this sync
// ships. The marketing lead card is exported as ReceiptCard to avoid colliding
// with the app LeadCard on window.CustomerZero.
export { CandidateTracker } from "@/components/app/candidate-tracker";
export { IcpPicker } from "@/components/app/icp-picker";
export { LeadCard } from "@/components/app/lead-card";
export { RadarFeed } from "@/components/app/radar-feed";
export { SwarmFeed } from "@/components/app/swarm-feed";
export { DitherPhoto } from "@/components/marketing/dither-photo";
export { LeadCard as ReceiptCard } from "@/components/marketing/lead-card";
