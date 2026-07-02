# Vyaz Voice Agent — Unit Economics

_Last updated: 2026-07-02_

## Assumptions & scope

- **Model:** Gemini Live `gemini-3.1-flash-live-preview`.
- **Average chapter:** 4,500 words ≈ **~30 min** of verbatim narration (@ ~150 wpm).
- **Architecture fact (critical):** audio streams **browser ↔ Gemini directly**. Per session our infra does only **1 Supabase edge call + 1 DB write**; Vercel serves the static app (~1–2 MB, once). So **Supabase/Vercel are capacity ceilings, not per-session costs.**
- The only meaningful **variable cost is the Gemini Live API**.

---

## 1. Cost structure — current stack

### Per-chapter Gemini cost

| Component | Rate | Avg chapter (~30 min) |
|---|---|---|
| Audio **output** (narration) | $12 / 1M tok (~$0.018/min) | **$0.54** |
| Audio **input** (mic, continuous) | $3 / 1M tok (~$0.005/min) | $0.15 |
| Output transcription (bubbles) | $4.50 / 1M tok | $0.03 |
| Context (chapter in system prompt, re-billed) | $0.75 / 1M tok | $0.02–0.09 |
| **Total, no Q&A** | | **≈ $0.75** |

> ~70% of cost is **audio output** — verbatim reading is long, so narration length dominates the bill.

### Q&A variability

| Usage | Extra | Per chapter |
|---|---|---|
| None | — | **~$0.75** |
| Light (2–3 questions) | +$0.05 | ~$0.80 |
| Moderate (5–8 questions) | +$0.10–0.15 | **~$0.90** |
| Heavy (15+ questions, +10 min) | +$0.30–0.40 | **~$1.15** |

➡️ **~$0.75–1.15 per chapter session; budget ~$0.90 typical.**

### Sessions per day / month — bounded by concurrency, not cost (on defaults)

| Constraint | Ceiling |
|---|---|
| **Gemini concurrency** (~3 sessions/key, ~35 min each) | ~120 sessions/day _theoretical max_; realistically **~30–40/day** at normal peak utilization |
| **Cost** (~$0.90/session) | $100/day → ~110 sessions; **~$900–1,000 per ~1,000 sessions/mo** |
| Supabase Free | 500K edge calls/mo (non-issue) — **but pauses after 7-day inactivity → not production-safe** |
| Vercel Hobby | 100 GB bandwidth (fine) — **but non-commercial use only** |

### ⚠️ Two hard blockers on the current setup

1. **~3 concurrent Live sessions per API key** → only ~3 users can narrate simultaneously. Hard wall for mass usage.
2. **~10–15 min per WebSocket connection** → a 30-min chapter **exceeds one connection** and would drop mid-chapter without **session resumption / reconnection** (not yet built).

---

## 2. Scaling plans available

| Layer | Current | Next step | Ceiling |
|---|---|---|---|
| **Gemini Live** | Free/default (~3 concurrent, 5–15 RPM) | **Tier 1** pay-as-you-go (150–300 RPM, higher concurrency) → **Tier 2** (1,000 RPM) | **Vertex AI: 1,000 concurrent sessions/project** — the real mass-scale path |
| **Supabase** | Free ($0, pauses) | **Pro $25/mo** (no pause, 250 GB BW, 100K MAU; edge $2/1M over) | Team $599/mo (SOC2, SLAs) |
| **Vercel** | Hobby (non-commercial) | **Pro $20/dev/mo** (1 TB BW, 10M edge req, commercial OK) | Enterprise (custom, 100K+ concurrency) |

> **Insight:** Supabase + Vercel Pro upgrades are cheap (~$45/mo combined) and mostly buy **legality + uptime**. The real scaling lever is **Gemini concurrency** — moving from a Developer API key (~3) to **Vertex AI (1,000/project)**.

---

## 3. Unit economics under sensible plan combos

### Combo A — "Launch" (small commercial)
**Supabase Pro + Vercel Pro + Gemini Tier 1**

- Fixed infra: **~$45/mo**
- Variable: **~$0.90/chapter**
- Concurrency lifts off the ~3 wall; still needs reconnection for full chapters
- Capacity: a few hundred sessions/day comfortably

| Volume | Monthly cost |
|---|---|
| 1,000 sessions/mo | ~$45 + $900 = **~$945** |
| 5,000 sessions/mo | ~$45 + $4,500 = **~$4,545** |

### Combo B — "Scale" (mass usage)
**Supabase Pro/Team + Vercel Pro + Gemini on Vertex AI**

- Fixed infra: **~$45–620/mo** (Pro → Team as MAU/SLA needs grow)
- Concurrency: **up to 1,000 simultaneous sessions** — removes the hard wall
- Binding limit becomes **budget**, not infra

| Volume | Monthly cost |
|---|---|
| 10,000 sessions/mo | ~$9,000 + ~$150 infra = **~$9,150** |
| 50,000 sessions/mo | ~$45,000 Gemini + infra = **~$45,000+** |

---

## Takeaways

- **Variable cost is ~$0.90/chapter and essentially plan-independent** — it's Gemini audio, scaling linearly with usage. Infra plans raise the *ceiling* and keep you legal/online; they don't reduce per-session cost.
- **At scale, P&L ≈ $0.90 × chapters listened.** Monetization must clear that per session.
- **Before mass rollout, two must-fixes:** (a) **session resumption** for chapters >15 min; (b) move Gemini to a **higher tier / Vertex AI** for concurrency.
- **Biggest cost lever = shrink audio-output minutes.** RAG (item #4) doesn't help here; only a shorter-audio mode (summary/discussion) or a cheaper/faster model would — a direct tradeoff against the verbatim experience.

---

## Sources
- [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Live API limits & specs](https://firebase.google.com/docs/ai-logic/live-api/limits-and-specs)
- [Gemini Live pricing](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview)
- [Supabase pricing](https://supabase.com/pricing)
- [Vercel pricing](https://vercel.com/pricing)
