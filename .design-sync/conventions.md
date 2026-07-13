# CustomerZero — building with this design system

These are the real components from the CustomerZero product (a Next.js app). They style themselves with **Tailwind CSS v4 utility classes bound to a custom token scale**. There is **no theme provider or wrapper** — render a component and it is styled, as long as the shipped `styles.css` is loaded (it carries every token as a CSS variable plus the utility classes the components use).

## Styling idiom — Tailwind v4 with brand tokens

Use these utility families; the names below all exist in the shipped CSS. Do **not** invent Tailwind colors like `bg-blue-500` — this system uses named brand tokens only.

- **Color** (text/bg/border): `obsidian` (near-black ink), `graphite`, `iron`, `slate`, `steel`, `fog`, `ash` (grays, dark→light), `mist` (hairline borders), `cloud` (chips), `paper` (page bg), `white`, `pure-black`, `glacier-tint` (the ONE accent — reserved for verified/evidence; e.g. `bg-glacier-tint`), `badge-slate` (stage badges). e.g. `text-obsidian`, `text-iron`, `border-mist`, `bg-glacier-tint`, `bg-badge-slate text-white`.
- **Type scale** (named, not `text-sm`): `text-caption` (12px), `text-body-sm` (14px), `text-body` (16px), `text-subheading` (20px), `text-heading-sm` (24px), `text-heading` (32px), `text-display` (56px).
- **Fonts**: body text defaults to Inter (loaded via a remote `@import`). Use `font-mono` (Geist Mono) for metadata, channels, and audit trails. Headings use `font-fraktion`, which **falls back to system sans** — Fraktion is not shipped (this matches production).
- **Spacing utilities are PIXELS, not the default rem scale**: `p-16` = 16px, `gap-24` = 24px, `mt-8` = 8px. Allowed steps: 8, 16, 24, 32, 40, 48, 56, 72, 80.
- **Radius / shadow / motion**: `rounded-sm` (2px, the only radius), `shadow-sm` and `shadow-sm-2` (elevated), easing var `--ease-out-strong`.

## Composition notes

- **No provider needed.** Components are self-contained.
- Several components take **richly-typed props** from the product's domain — `LeadCard`/`RadarFeed` take a `Lead` (or `Lead[]`), `IcpPicker` takes `ICPHypothesis[]` + a `ProductBrief`, `CandidateTracker`/`SwarmFeed` take `RunEvent[]`. Read each component's `.d.ts` for the exact shape and its `.prompt.md` for a worked example before composing.
- `ReceiptCard` is the marketing "receipt" card: flat string props (`name`, `persona`, `company`, `quote`, `source`, `date`, `score`, `stage`, `rejected?`). The signature evidence card — every field is a receipt line.
- `DitherPhoto` renders a live WebGL ordered-dither of an image; pass `image` (a URL or data URI) and optionally `colorBack`/`colorFront`/`inverted`. Give it a sized, `overflow-hidden` parent — it fills 100% of its container.

## Where the truth lives

- Tokens + utilities: the shipped `styles.css` (imports `_ds_bundle.css` for component-module styles). Read it before styling custom layout glue.
- Per component: `<Name>.d.ts` (props contract) and `<Name>.prompt.md` (usage).

## Idiomatic snippet

```tsx
import { ReceiptCard } from "customerzero";

// Brand layout glue uses the same token utilities the components do.
<div className="rounded-sm border border-mist bg-white p-24 shadow-sm" style={{ maxWidth: 460 }}>
  <p className="mb-16 font-mono text-caption uppercase text-iron">
    Verified receipt
  </p>
  <ReceiptCard
    name="Rina Patel"
    persona="Head of Customer Success"
    company="Pylonworks"
    quote="I need the evidence attached to every ask."
    source="github.com/pylonworks/feedback/issues/184"
    date="July 11, 2026"
    dateTime="2026-07-11"
    score="82"
    stage="problem aware"
  />
</div>
```
