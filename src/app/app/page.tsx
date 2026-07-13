import { RunCreationForm } from "@/components/app/run-creation-form";
import { RunsList } from "@/components/app/runs-list";

export default function CreateRunPage() {
	return (
		<main className="flex flex-1 items-start justify-center px-16 py-48 sm:px-24">
			<div className="w-full max-w-xl space-y-32">
				<RunCreationForm />
				<RunsList />
			</div>
		</main>
	);
}
