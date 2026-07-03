# Vyaz Pricing Strategy — AI Voice Agent (Talk)

_Last updated: 2026-07-03_

## Locked decisions (from strategy Q&A)

| Dimension | Decision |
|---|---|
| **What we price** | The AI voice agent (**Talk**) only — narration + discussion. |
| **Segment** | **Premium learners** — students, aspirants, professionals, English-first readers (WTP ~₹299–499/mo). |
| **Positioning** | **Premium AI tutor / companion**, priced to stay India-accessible (not a barrier to acquisition at this stage). |
| **Headline model** | **Freemium 3-tier + verbatim credits.** |
| **Cost lever** | **Concise/discussion mode as the everyday default; verbatim (full read) as premium.** |
| **Free tier** | Limited taste: **2–3 concise audio chapters/mo** (no separate text tier — see below). |
| **Posture** | Both **bounded-burn** and **breakeven-first** modeled for decision. |

> **Product truth:** Vyaz is an **AI-experiential book platform** — the on-screen transcript (speech bubbles) *is* part of the audio experience, not a separate product. There is **no "text summary" SKU**; we improve the transcript's presentation, we don't sell it apart from the voice.

---

## 1. The core constraint (why this is hard)

Indians pay **₹120–200/mo for _unlimited_ audio** (Audible ₹199, Spotify ₹119, YouTube Premium ₹129, Kuku FM ~₹399/**year**, Pocket FM = freemium + coin microtransactions). They can do "unlimited" because their content cost is ~₹0 — pre-recorded, served from a CDN.

**Our cost is per-use LLM generation.** So "unlimited" is structurally impossible for us today. The strategic implication: **we sell _focused learning_, not binge audio.** Position as a study companion a learner uses to work through specific books — never as "unlimited audiobooks."

---

## 2. The cost lever — two delivery modes

| Mode | Audio length | Cost / chapter | Role |
|---|---|---|---|
| **Concise / discussion** | ~6–8 min | **~₹17** (~$0.20) | Everyday default |
| **Verbatim** (full word-for-word read) | ~30 min | **~₹75** (~$0.90) | Premium add-on |

> ⚠️ Even *concise* at ₹17/ch means a ₹199 sub only affords ~10 chapters at breakeven.
> **Cost reduction is strategic, not cosmetic.** Driving concise cost from ~₹17 → **~₹10/ch** (cheaper/faster model, context caching, shorter chunks) is what turns a "tight study tool" into a "generous companion." Treat as a parallel must-do, tracked alongside pricing.

---

## 3. Recommended structure — Freemium 3-tier + verbatim credits

Allowances are sized for the target segment ("working through specific books"), **not** unlimited consumption.

| Tier | Price / mo | Includes | Our cost | Gross margin |
|---|---|---|---|---|
| **Free** (taste) | ₹0 | 2–3 concise audio ch/mo | ~₹34–51 | CAC (acquisition spend) |
| **Learner** (hook) | **₹199** | ~10 concise ch/mo | ~₹170 | ~15% |
| **Scholar** (core) | **₹449** | ~22 concise ch/mo + priority | ~₹375 | ~16–25% |
| **Verbatim** (à la carte) | **₹99/ch** or 5-pack **₹399** | full-read premium chapters | ~₹75/ch | ~24% |

This single structure exercises **all three margin mechanisms** at once:
- **Fair-use caps** — the per-tier chapter allowances protect margin.
- **Metered credits** — verbatim à la carte, so that high-cost usage always tracks revenue.
- **Flat-unlimited** — deliberately *not* offered now; only becomes viable if concise cost collapses toward ~₹0.

**Why Freemium (vs a single flat sub):** at this stage you need *first paying customers* in a value-conscious market. A free audio taste lowers the acquisition barrier and lets the experience prove itself before payment. (A flat-sub alternative — single **₹299/mo, fair-use ~15 concise ch** — is simpler to message but has no free hook, making cold-start acquisition harder.)

---

## 4. Free-tier economics (honest)

Free is **all audio** (no text tier), so it has a **real, non-zero cost**: ~₹34–51 per free user per month.

- At **10,000 free users → ~₹3.4–5.1 L/mo burn** before any conversion.
- **Manage it by:** (a) keeping the free cap tight (2–3 concise ch, hard cap), (b) relentless conversion focus (the free taste must *sell* the paid tiers), (c) the cost-reduction roadmap (every ₹ off concise cost directly reduces free burn).
- This is an accepted, *bounded* CAC — not an open tap.

---

## 5. Posture scenarios

### Bounded-burn (growth with guardrails)
- Generous-ish free (2–3 ch), thin-margin ₹199 hook, early subsidy — but **capped** (no unlimited; free ≤3 ch).
- Per-user loss is bounded by design; a whale cannot sink the model.
- **Watch item:** free-tier burn scales with signups — lean on conversion + cost reduction.

### Breakeven-first (safe runway)
- Free = 1 concise ch, every tier priced ≥30% margin, verbatim strictly at cost-plus.
- Slower acquisition, but each active paying user roughly covers their own cost from day one.
- Better if funding/runway is tight.

**Recommendation:** start **bounded-burn** to win early learners, with breakeven-first as the fallback discipline if free-tier burn outruns conversion.

---

## 6. Illustrative funnel (bounded-burn, month snapshot)

_Assumes concise cost ~₹17/ch; numbers move materially with cost reduction._

| Metric | Value |
|---|---|
| Free users | 10,000 |
| Free burn (~₹42 avg) | ~₹4.2 L |
| Conversion to paid | 5% → 500 paying |
| Mix | 350 Learner (₹199) + 150 Scholar (₹449) |
| Paid revenue | ₹69,650 + ₹67,350 = **~₹1.37 L** |
| Paid serving cost | ~₹0.60 + ~₹0.56 L = **~₹1.16 L** |
| **Net (paid − free burn)** | ₹1.37 L − ₹1.16 L − ₹4.2 L ≈ **−₹4.0 L/mo** |

➡️ **Takeaway:** at current cost, free-tier audio burn dominates the P&L. The two levers that flip this positive are **(1) higher conversion** and **(2) lower concise cost (~₹17 → ~₹10)** — not raising prices (which hurts acquisition). This is the single most important insight in the doc.

---

## 7. Risks & watch-list

1. **"Unlimited" expectation gap** — never market as unlimited audiobooks; frame as a focused study companion.
2. **Free-tier bleed** — free is real audio cost; keep the cap tight and conversion sharp.
3. **Cost reduction is on the critical path** — the model is ~2× healthier at ₹10/ch. Prioritize it with pricing, not after.
4. **Verbatim is a margin trap if bundled** — keep it credit-gated (à la carte), never inside a flat allowance.

---

## 8. Recommendation (one-liner)

**Launch Freemium 3-tier (Free 2–3 ch → ₹199 Learner → ₹449 Scholar) + ₹99/ch verbatim credits, positioned as a premium AI study companion for learners — run bounded-burn, and treat concise-mode cost reduction (₹17 → ₹10) as a co-equal priority to pricing, because it, plus conversion, is what makes the unit economics work.**

---

## Appendix — assumptions
- Model: Gemini Live `gemini-3.1-flash-live-preview`; avg chapter 4,500 words.
- FX ~₹83/USD. Concise ~$0.20/ch; verbatim ~$0.90/ch.
- Infra (Supabase Pro + Vercel Pro ~₹3.7k/mo) excluded from per-user math — negligible vs. Gemini variable cost. See `docs/unit-economics.md`.
