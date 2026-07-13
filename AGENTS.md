<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

**Keep this block, including in commits.** It is part of the project's agent setup, maintained by `next dev` for every agent that works here. If it appears as an uncommitted change, that is intentional — commit it as-is. Do not remove it to clean up a diff; it will be regenerated.
<!-- END:nextjs-agent-rules -->

# Project Instructions

- **Package Manager:** Always use `pnpm` for package management.
- Any instruction that would otherwise reference `CLAUDE.md` should be treated as a reference to `AGENTS.md`.

## Workflow Orchestration

### 1. Plan Node Default

- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, stop and re-plan immediately.
- Use plan mode for verification steps, not just building.
- Write detailed specs up front to reduce ambiguity.

### 2. Subagent Strategy

- Use subagents liberally to keep the main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at them via subagents.
- One task per subagent for focused execution.

### 3. Self-Improvement Loop

- After any correction from the user, update `tasks/lessons.md` with the pattern.
- Write rules for yourself that prevent the same mistake.
- Iterate on these lessons until mistake rate drops.
- Review lessons at session start for the relevant project.

### 4. Verification Before Done

- Never mark a task complete without proving it works.
- Diff behavior between main and your changes when relevant.
- Ask: "Would a staff engineer approve this?"
- Run tests, check logs, and demonstrate correctness.

### 5. Demand Elegance (Balanced)

- For non-trivial changes, pause and ask if there is a more elegant way.
- If a fix feels hacky, implement the elegant solution.
- Skip this for simple, obvious fixes; do not over-engineer.
- Challenge your own work before presenting it.

### 6. Autonomous Bug Fixing

- When given a bug report, fix it directly without hand-holding.
- Point at logs, errors, and failing tests, then resolve them.
- Require zero context switching from the user.
- Fix failing CI tests without being told how.

## Task Management

1. **Plan First:** Write plan to `tasks/todo.md` with checkable items.
2. **Verify Plan:** Check in before starting implementation.
3. **Track Progress:** Mark items complete as you go.
4. **Explain Changes:** High-level summary at each step.
5. **Document Results:** Add review section to `tasks/todo.md`.
6. **Capture Lessons:** Update `tasks/lessons.md` after corrections.

## Core Principles

- **Simplicity First:** Make every change as simple as possible and keep impact minimal.
- **No Laziness:** Find root causes and avoid temporary fixes.
- **Minimal Impact:** Touch only what is necessary and avoid introducing bugs.

## API Docs First

- Before any implementation, always pull the latest API docs, read them, and only then implement.

## Next.js: Always Read Docs Before Coding

- Before any Next.js work, read the relevant version-matched doc in `node_modules/next/dist/docs/`. Treat those bundled docs as the source of truth for this repo's installed Next.js version.

## Next.js 16 Specific Guidance

- Prefer the App Router for new work. Use the Metadata API for titles, meta tags, OG images, `robots`, and sitemaps instead of hand-rolled `<head>` tags.
- Treat Dynamic APIs as async. `params`, `searchParams`, `cookies()`, `headers()`, and `draftMode()` must be awaited in Next 16.
- When route types change, run `pnpm next typegen` and prefer `PageProps`, `LayoutProps`, and `RouteContext` instead of ad hoc route prop types.
- Turbopack is the default in Next 16. Do not add `--turbopack` flags. Only opt into `--webpack` when a concrete incompatibility forces it.
- Do not use `next lint`. Next 16 removed it, and `next build` no longer runs lint automatically. Run the repo's direct linter commands with `pnpm` as part of verification.
- If local tooling needs cross-origin access to the dev server, use `allowedDevOrigins` in `next.config.*` instead of weakening Next.js development protections ad hoc.
- Use `proxy.ts`, not `middleware.ts`, for standard request interception. Keep it root-level, keep matchers narrow, exclude metadata files like `favicon.ico`, `robots.txt`, and `sitemap.xml`, and remember `proxy.ts` runs on the Node.js runtime.
- Prefer `await connection()` over `export const dynamic = 'force-dynamic'` when you need true per-request rendering.
- For loading UX, prefer route-level `loading.tsx`, `Suspense`, and normal prefetching. Use `useLinkStatus` only for subtle inline pending hints when a slow navigation still needs feedback.
- If you enable Cache Components, use `cacheComponents: true` with explicit `use cache` and `Suspense` boundaries. Do not use removed `experimental.ppr` patterns.
- For cache invalidation, use `updateTag()` for read-your-writes mutations in Server Actions and `revalidateTag(tag, 'max')` for stale-while-revalidate content.
- Every parallel route slot needs an explicit `default.tsx`. Return `null` or `notFound()` intentionally instead of relying on implicit behavior.
- Use `next/image` instead of `next/legacy/image` when optimization matters. Prefer `images.remotePatterns` over deprecated `images.domains`.
- Treat image security defaults intentionally: `images.dangerouslyAllowLocalIP` should stay off unless you are on a private network, and `images.maximumRedirects` should only be raised for a concrete edge case.
- Remember the Next 16 image defaults changed: `images.minimumCacheTTL` defaults to 4 hours, and `quality` values are constrained by `images.qualities`.
- Use `instrumentation-client.ts` for early client-side analytics, performance, and error hooks when needed, and keep it lightweight so it does not slow startup.
