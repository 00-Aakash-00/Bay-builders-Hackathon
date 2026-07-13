import { type ComponentType, useEffect, useState } from "react";

type Loader = () => Promise<unknown>;

// Standalone stand-in for `next/dynamic` so DitherPhoto bundles outside Next.
// Loads the target module on mount and renders it; the ssr/loading options
// Next accepts are taken and ignored. The real component is unchanged — only
// its dynamic-import wrapper is swapped for this at bundle time.
export default function dynamic(loader: Loader, _options?: unknown) {
	return function Dynamic(props: Record<string, unknown>) {
		const [Loaded, setLoaded] = useState<ComponentType<unknown> | null>(null);
		useEffect(() => {
			let active = true;
			Promise.resolve(loader()).then((mod) => {
				if (!active) return;
				const record = mod as { default?: ComponentType<unknown> };
				const Comp = (record?.default ?? mod) as ComponentType<unknown>;
				setLoaded(() => Comp);
			});
			return () => {
				active = false;
			};
		}, []);
		return Loaded ? <Loaded {...props} /> : null;
	};
}
