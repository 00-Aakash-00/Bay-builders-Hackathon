---
name: codex-house-rules
description: Operating rules for Codex agents working in this repo. Read before any change; obey throughout.
---

# Codex House Rules — CustomerZero

You are one of several agents working on this repo in parallel. A PM orchestrator reviews everything you produce. These rules exist so your work merges cleanly and ships today.

## Read before coding (in this order)

1. `AGENTS.md` — repo conventions (pnpm, Biome, Next.js 16 specifics).
2. `DESIGN.md` — branding tokens **and the Motion section**. Styling uses token utilities only (`bg-paper`, `text-obsidian`, `ease-out-strong`…). Never hardcode a hex, px size, or cubic-bezier that a token already covers.
3. `docs/PRD.md` and `docs/architecture.md` — the product and system spec.
4. `.agents/skills/emil-design-eng/SKILL.md` — mandatory before writing ANY animation code.
5. `node_modules/next/dist/docs/` — this Next.js 16 has breaking changes vs. your training data (async `params`/`searchParams`, no `next lint`, Turbopack default). The bundled docs are the source of truth; read the relevant guide before using an API you're not certain about.

## Hard rules

- **Scope discipline:** touch ONLY the paths listed in your task's SCOPE. Everything else is owned by another agent.
- **No package installs.** Everything you need is already in `package.json`. If you believe you need a dependency, stop and say so in your final message instead of installing.
- **No servers, no git:** never run `pnpm dev`/`next dev`/`pnpm build`; never `git add/commit/push`. The PM builds, reviews, and commits.
- **Verification loop:** after implementing, run `pnpm lint:fix` then `pnpm typecheck`; fix and repeat until both are clean. Report the final status.
- **Final message must include:** assumptions you made, files you created/modified, verification results, and anything you were uncertain about.
- If something is genuinely ambiguous AND materially changes the build, stop and ask (output the question) instead of guessing. Otherwise: make the reasonable call and log it as an assumption.

## Operating principles

1. **Think Before Coding.** Don't assume. Don't hide confusion. Surface tradeoffs. State your assumptions explicitly. If multiple interpretations exist, present them — don't pick silently. If a simpler approach exists, say so. Push back when warranted. If something is unclear, stop, name what's confusing, ask.
2. **Simplicity First.** Minimum code that solves the problem. Nothing speculative. No features beyond what was asked. No abstractions for single-use code. No "flexibility" or "configurability" that wasn't requested. No error handling for impossible scenarios. If you write 200 lines and it could be 50, rewrite it. Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
3. **Surgical Changes.** Touch only what you must. Don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken. Match existing style. If you notice unrelated dead code, mention it — don't delete it. Remove imports/variables/functions that YOUR changes made unused; leave pre-existing dead code alone. Every changed line should trace directly to the task.
4. **Goal-Driven Execution.** Define success criteria. Loop until verified. State a brief plan: `[Step] → verify: [check]` for each step. Strong success criteria let you loop independently.
