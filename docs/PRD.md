# CustomerZero — Product Requirements Document

> **Your first 10 customers, with receipts.**
> Enter your startup's domain. An agent swarm figures out who has the exact pain you solve, hunts the live web for people expressing it *right now*, kills every lead it can't prove, and hands you a scored shortlist — each lead carrying a quote, a link, a timestamp, and a founder-voice opener you approve and send from your own Gmail.

| | |
|---|---|
| **Product** | CustomerZero |
| **Status** | Hackathon build — Bay Builders Hackathon, July 13, 2026 |
| **Platform** | Web app (Next.js 16) + agent worker |
| **Design source of truth** | [`DESIGN.md`](../DESIGN.md) (tokens in `src/app/globals.css`) |

---

## 1. Problem

**43% of startups die because they never find real demand** (CB Insights post-mortems: "no market need" / poor PMF is the #1 root cause; running out of money is just the terminal symptom). The canonical fix is founder-led sales — Paul Graham's "do things that don't scale," Michael Seibel's "10 customers with a burning problem beat 1,000 with a passing annoyance."

But the actual work of founder-led sales is brutal and manual:

1. Guess who your customer is (usually wrong on the first try).
2. Trawl Reddit, Hacker News, X, G2 reviews, GitHub issues, and job boards for people describing your problem.
3. Figure out who they actually are and whether they're reachable.
4. Write a personal note that doesn't sound like spam.
5. Repeat for weeks, while also building the product.

Founders demonstrably want this automated: GummySearch grew to **140,000 users** doing single-channel Reddit pain-mining before shutting down in Nov 2025; F5Bot keyword alerts remain a founder staple; "how did you find your first 10 customers" is a permanently recurring HN/r/startups thread.

### Who it's for

- **Priya, pre-seed B2B founder.** Has a landing page and a demo. Needs 10 design partners, not 10,000 rows in a CRM. Can't spend $15K/yr or learn Clay. Sends every email herself.
- **Dev, indie hacker.** Ships fast, sells badly. Lives on Reddit/HN. Wants "who's complaining about this today?" as a product, not a Saturday habit.

### Non-goals

- Not an AI SDR. We never auto-send at volume; the founder is always the sender.
- Not a contact database. We store nothing that didn't come from a live, cited public signal.
- Not a CRM. We hand off to whatever the founder uses.
- No login-walled scraping, no data brokers, no personal-email guessing, no LinkedIn automation.

---

## 2. Positioning & competitive gap

Pre-seed founders sit in a dead zone between two markets:

| Tool | What it is | Price reality | Why it fails a day-zero founder |
|---|---|---|---|
| Clay | GTM workbench, waterfall enrichment, Claygent | $185–495/mo + steep learning curve; ~$0.65–1.20/contact | A workbench, not an answer. Starts from a list/ICP you already have. |
| Apollo | Static 200M+ contact DB + sequencer | $49–119/user/mo | Firmographic filters, not intent. Everyone cold-emails the same stale list. |
| ZoomInfo | Enterprise sales intelligence + topic intent | ~$15K–40K/yr, annual only | Unbuyable pre-seed; intent is aggregated topics, not a named person with a quotable pain. |
| Common Room | Signal aggregation across 50+ channels | $1,700/mo+, annual | Closest philosophy, enterprise packaging; assumes an existing community/telemetry. |
| Unify | "Warm outbound" on third-party intent | ~$21K/yr | Intent vendors, not first-party public quotes; assumes traffic + CRM. |
| 11x / Artisan / AiSDR | Autonomous outbound agents | $9K–100K/yr | Volume spray. Sender reputation −38 pts in 90 days; 60%+ reply decay; FTC/state-AG actions on hallucinated personalization (2025–26). |
| Coldreach (YC) | Custom buying signals + evidence, per account universe | Sales-led | Closest direct competitor — but starts from an account list and corporate signals (hiring, 10-Ks), not from a raw pitch and conversational pain. Not self-serve founder-priced. |
| Exa Websets / Firecrawl recipes | Entity search / DIY scraping stacks | Usage-based | Infrastructure, not product. Founder still writes criteria, judges pain, verifies, drafts. |
| GummySearch†, ReplyGuy, Devi AI… | Reddit keyword monitors | $20–50/mo | Single channel, keyword-level, no entity resolution, no verification, spammy auto-replies. GummySearch's death = platform-dependency lesson. |

**The open slot:** the full loop at founder scale — *pitch in → multi-channel live pain mining → entity resolution → verified evidence on every lead → scoring → founder-voice draft, sent by the founder in low volume.* Nobody ships it. CustomerZero does.

### Why now

The AI-SDR backlash is the tailwind: buyers pattern-match AI cold email in seconds, deliverability collapses at agentic volume, and 2026 consensus has swung to human-in-the-loop, low-volume, evidence-grounded outreach — exactly the motion CustomerZero productizes.

---

## 3. Product principles

1. **Evidence or it doesn't exist.** Every lead carries a quote + URL + timestamp. An adversarial verifier re-fetches every source and kills anything that doesn't hold. A lead without receipts cannot enter the pipeline — enforced in the agents *and* the database.
2. **The founder is the sender.** We draft; the founder approves; the send goes through the founder's own connected Gmail. Low volume by design. This is counter-positioning against the spray-and-pray AI SDR, not a lesser version of it.
3. **Hypothesis, not database.** A prospect is "a potential customer based on public signals" — never "interested," never "confirmed." Uncertainty and stale dates are visible on the card.
4. **Show the work.** The swarm's searching, finding, discarding, and re-strategizing streams live. Transparency is the trust mechanism for the evidence guarantee — auditability, not eye candy.
5. **Respect the web.** Public, intentionally-shared professional/business information only, accessed through licensed search indexes. No login walls, no robots violations, no protected traits, no private-data enrichment.

---

## 4. User journey

1. **Enter domain.** Founder pastes `https://theirstartup.com` (or a one-line pitch) and hits *Find my customers*.
2. **Product brief.** `intake-analyst` reads the site and plays back what it understood: product, outcome, buyer, price motion, strongest use case. *(~20s)*
3. **ICP confirm — the one required human gate before results.** `icp-architect` proposes 2–3 ICP hypotheses with pain triggers and disqualifiers. Founder picks/edits one. *(~15s)*
4. **The hunt.** `hunt-strategist` expands the ICP into query packs (5 signal buckets × channels). Hunter agents fan out in parallel across Reddit/HN/X/forums, competitor G2 & app-store reviews, GitHub issues, and job posts — via Tavily, You.com, and Nimble SERP. The dashboard shows one lane per agent: searching, found, discarded.
5. **The gauntlet.** Every candidate signal is extracted to a typed record, deduped against everything already seen (HydraDB entity resolution), **re-fetched and quote-matched by the verifier (default: reject)**, scored 0–100 on the rubric, and enriched with a reachable public channel.
6. **Re-strategize, visibly.** When a channel runs dry, the orchestrator pivots — e.g. *"Reddit exhausted for this ICP → mining G2 reviews of [nearest competitor]"* — and posts the decision to the run room.
7. **The shortlist.** 10 verified leads (standard run), each card showing: who, the exact quote, source link + date, score breakdown, stage (high intent / problem aware / trigger present), why-now, suggested channel, and a ≤90-word opener grounded only in the cited quote.
8. **Approve → send.** Founder connects Gmail once (Kylon OAuth). Per lead: approve → Kylon executes `GMAIL_SEND_EMAIL` from the founder's own account. Or copy/export the draft instead.
9. **Radar on.** The run's winning queries become a standing monitor: re-hunts on an interval, new verified signals alert the founder in-app, in the BAND room, and via Kylon (Slack/Gmail). *The run is the wedge; the radar is the subscription.*

---

## 5. Features

### P0 — must demo today

| Feature | Definition of done |
|---|---|
| Domain → product brief → ICP confirm | Real site analyzed; editable ICP hypotheses; one human gate |
| Multi-channel hunt | ≥4 source types live (Reddit/HN via search index, G2/reviews, GitHub issues, job posts); parallel hunter lanes |
| Evidence verification | Verifier re-fetches every source; quote-match; visible rejection events; zero unverified leads in UI |
| Dedupe | HydraDB entity resolution + signal-hash gate; same person/company never appears twice |
| Scoring + shortlist | Rubric (pain 25 / fit 25 / timing 20 / reachability 15 / evidence 15); stages; cards with full receipts |
| Outreach drafts | ≤90 words, quote-grounded, channel-appropriate |
| Approve → Kylon send | Gmail connected via Kylon OAuth; per-lead approval; send from founder's account |
| Live swarm feed | SSE lanes per agent: searches, finds, rejections, pivots, budget |
| BAND run room | Agents post stage handoffs; full audit trail; founder messages steer the orchestrator |
| Radar (working) | Standing re-hunt on interval (demo: 2 min + "trigger now"); delta-detected new signals alert in-app + BAND + Kylon |

### P1 — if time remains / day after

- Pain-pattern panel (`pattern-analyst`): recurring pains across leads, market-graph view from HydraDB.
- Exports: Notion/Sheets via Kylon; CSV.
- Run depth modes: quick (5) / standard (10) / deep (20). Target modes: customers / design partners / B2B / community.
- Seven-day outreach plan generator per shortlist.

### P2 — post-hackathon vision

- Reply tracking + conversation outcomes feeding back into scoring.
- Multi-seat, billing (free wedge run → $49/mo radar; undercuts Clay $185/mo and Common Room $1,700/mo by an order of magnitude).
- EU data-subject workflows (notice, deletion, exclusion lists).

---

## 6. Sponsor technology mapping

| Technology | Status | Load-bearing role |
|---|---|---|
| **InsForge** | required | Platform spine: Postgres system-of-record (runs, signals, leads, evidence, drafts, events…), auth, storage for report artifacts. |
| **BAND** (band.ai) | required | Agent coordination + audit: one room per run, @mention stage handoffs, unified audit trail, founder-in-the-room steering via Human API. |
| **Kylon** (kylon.io) | required | Action layer: Gmail OAuth broker + `tools/execute` (`GMAIL_SEND_EMAIL`) for approved sends; radar alerts; exports. |
| **Nimble** (nimbleway.com) | required | Web-data muscle: SERP at scale for signal hunting, Extract (JS-render/unblocking) for enrichment + verification fallback, Map/Crawl for public contact discovery, reviews mining. |
| **HydraDB** | optional → used | Agent memory: entity-resolution dedupe, versioned evidence ledger (trace which fact drove a score), cross-run market-pain graph powering radar + patterns. |
| **Tavily** | optional → used | Breadth search workhorse + Extract for evidence re-verification. |
| **You.com** | optional → used | News-blended hunting (funding/launch/timing triggers) + cited Research dossiers on top-decile leads. |
| **Claude (Anthropic)** | runtime | Claude Agent SDK orchestrator + tiered subagents (Haiku extraction / Sonnet workers / Opus verification & strategy). |

---

## 7. Success metrics

**Demo-day**
- Time from domain paste → first verified lead on screen: **< 3 minutes**.
- Standard run completes with **≥ 10 verified leads**, zero leads lacking a working source link (evidence validity 100% by construction).
- The three money-moments land: a lead **rejected live** by the verifier; a **visible strategy pivot**; an **approved send** arriving from the founder's own Gmail.
- Radar produces a new verified alert during the demo window.

**Product (post-hackathon)**
- ≥ 30% of shortlist leads rated "would contact" by the founder.
- Reply rate on sent openers ≥ 3× founder's prior cold baseline.
- Weekly radar retention: founder returns to triage alerts ≥ 2×/week.

---

## 8. Risks & mitigations

| Risk | Reality | Mitigation |
|---|---|---|
| Platform API gating | Reddit commercial API requires paid licensing + approval (killed GummySearch, 140K users); X API expensive; LinkedIn prohibits scraping | Consume **licensed search indexes** (Tavily, You.com, Nimble SERP) and public pages only; never platform APIs with commercial gates; never logged-in access. Multi-channel by design = no single-platform dependency. |
| Scraping law | hiQ/Meta v. Bright Data support logged-**out** public scraping; logged-in collection is contractually exposed | Public, logged-out sources via compliant providers; robots respected by the providers; no auth-walled content, ever. |
| GDPR/CCPA | "Public" ≠ "free to process" in the EU (Clearview €30.5M; KASPR €240K) | Business-context data only; no personal-email guessing (public business contacts only); provenance stored per datum; deletion/exclusion honored; EU scope deferred (P2) and stated. |
| CAN-SPAM | Up to $53,088/email; no B2B exception | No auto-send. Per-lead human approval, founder's own mailbox, low volume, accurate identity, compliance footer, one-click manual opt-out language. |
| Hallucinated evidence/contacts | The documented AI-SDR failure mode (FTC actions) | The core feature: adversarial verifier re-fetches + quote-matches every source; unverifiable leads die; DB constraint blocks receipt-less leads. |
| Identity-resolution errors | Linking a handle to a person can be wrong → creepy/defamatory | Confidence surfaced on the card; openers reference *the public post*, not inferred identity; human approval gate before any send. |
| Competitive convergence | Coldreach/Trigify/Unify could move down-market | Moat = zero-to-one pitch→ICP flow + founder-priced packaging + evidence guarantee as brand. Speed. |
| Community backlash | Auto-replies in threads get banned | We never post into communities; we steer founders to email/DM with evidence context and honest framing. |

---

## 9. Demo script (7 minutes)

1. **Cold open (30s).** "43% of startups die because they never find demand. The tools that find customers start at $15K/yr and assume you already know who they are. Watch what happens when finding your first customers costs one URL."
2. **Paste a real audience-member startup's domain.** Brief appears; confirm ICP hypothesis #1 with one edit. *(60s)*
3. **Swarm view.** Hunter lanes light up across Reddit/HN, G2, GitHub, job posts. Narrate the signal buckets. *(90s)*
4. **Money moment #1 — the kill.** A promising lead hits the verifier; source re-fetch fails the quote match; the card visibly dies with the reason. "Every other tool would have emailed that person."
5. **Money moment #2 — the pivot.** A channel dries up; orchestrator posts its re-strategy to the BAND room; new lane spins up. Open the BAND room: full agent-to-agent audit trail.
6. **The shortlist.** 10 cards with receipts — quote, link, date, score breakdown, opener. *(60s)*
7. **Money moment #3 — the send.** Approve the top lead → Kylon fires `GMAIL_SEND_EMAIL` → switch tabs to the founder's actual Sent folder.
8. **Radar.** Flip it on; "trigger now"; a fresh verified signal alerts in-app + BAND + Slack. "The run found your first ten. The radar finds the next hundred — that's the subscription."
9. **Close.** "Leads with receipts. Founder-sent. Built on InsForge, BAND, Kylon, Nimble, HydraDB, Tavily, and You.com."

---

## 10. Design

[`DESIGN.md`](../DESIGN.md) is the source of truth; tokens are implemented in `src/app/globals.css` (Tailwind v4 `@theme`) — use generated utilities, never hardcoded values.

Product-specific application of the system:

- **Mood:** editorial, forensic, calm. The product's promise is rigor — the UI should feel like a well-set dossier, not a growth-hacking tool. Grayscale ramp (`paper` page, `white` cards, `obsidian` ink, `iron`/`steel` secondary text), sharp `rounded-sm` corners, generous 8px-scale spacing.
- **Accent discipline:** `glacier-tint` is reserved for evidence — quote highlights, verified badges, the receipt strip on lead cards, primary CTA. If everything glows, nothing is proven.
- **Type:** `font-fraktion` for brand/display moments (`text-display` hero, lead scores); Inter for everything else. Quotes on lead cards set in `text-subheading` — the evidence *is* the hero.
- **Swarm feed:** `text-caption`/`text-body-sm` on `font-mono`, one lane per agent; rejection events in `pure-black` strikethrough — kills should be legible from the back of the room.
- **Cards:** `bg-white`, `border-mist`, `shadow-sm` at rest, `shadow-sm-2` on hover/elevated (approval modal); `badge-slate` for stage badges.
- **Motion:** per the repo's animation craft bar — ease-out, sub-300ms, transform/opacity only, interruptible; the swarm feed streams in with subtle 40ms staggers; no decorative animation on 100×/day actions.
