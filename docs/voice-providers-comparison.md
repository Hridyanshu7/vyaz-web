# Voice Agent Providers — Comparison

_Last updated: 2026-07-03. Rates are indicative (USD) and move fast — verify against live pricing pages before committing._

## ⚠️ Read this first: they're not the same category

Comparing headline "$/min" across these nine is apples-to-oranges. They fall into four layers:

| Layer | Providers | What the headline price covers |
|---|---|---|
| **Unified AI brain** (one bill, all-in) | **Gemini Live**, **OpenAI Realtime** | Everything — STT+LLM+TTS in one stream |
| **Bundled agent platform** (their own stack) | **Cartesia Line**, **ElevenLabs Conversational AI** | Their voice stack (± your LLM) |
| **Orchestration platform** (fee ON TOP of models) | **Vapi**, **Retell**, **Bolna** | *Only* the orchestration fee — you add STT+LLM+TTS+telephony |
| **Infra / framework** (transport, you run it) | **LiveKit**, **Pipecat** | *Only* transport/hosting — you pay + build everything |

**So an orchestration/infra provider's advertised rate is 3–6× lower than its real all-in cost.** All tables below use **effective all-in $/min**.

---

## 1. Effective all-in cost + latency

| Provider | Category | All-in $/min | Latency (response) | Concurrency ceiling |
|---|---|---|---|---|
| **Gemini Live** | Unified brain | **$0.02–0.03** | ~320ms p50 | ~3/key (Dev API) → **1,000/project (Vertex)** |
| **Cartesia Line** | Agent + Sonic TTS | **$0.014** (Scale) – $0.06 | **40–90ms TTS (fastest)** | Plan-based |
| **Bolna** | Orchestration (India) | $0.04–0.10 | sub-sec (unpublished) | Enterprise-scalable |
| **OpenAI Realtime** | Unified brain | $0.05–0.10 (cached / mini) → **$0.18–0.46** (uncached) | ~300–500ms | Tier-based |
| **ElevenLabs Conv. AI** | TTS + agent | $0.08–0.10 (burst $0.16) | ~75ms TTS, sub-sec | Plan concurrency limits |
| **Pipecat** | Framework | $0.01 host + models (~$0.08 total; **<$0.08 self-host at scale**) | = your chosen models | Self-managed / infra-bound |
| **LiveKit** | Infra (WebRTC) | $0.01 agent + models (~$0.06–0.21) | transport ~tens ms + your models | 600 (Scale) → Enterprise |
| **Retell** | Orchestration | **$0.11–0.31** | 620ms → up to 5,000ms (mode-variable) | Plan-based |
| **Vapi** | Orchestration | **$0.13–0.31** | sub-500ms claimed (multi-hop dead air) | Plan-based |

**Cheapest all-in:** Gemini Live and Cartesia (Scale). **Priciest:** Vapi, Retell, uncached OpenAI. **Fastest voice:** Cartesia Sonic TTS.

---

## 2. Cost at 10 / 100 / 1,000 / 1,000,000 users

**Assumption:** each user = **30 voice-minutes/month** (≈ one verbatim chapter, or ~4 concise chapters). Monthly $ = users × 30 × effective $/min. Adjust linearly for a different usage figure.

| Provider | eff. $/min | 10 users (300 min) | 100 (3K min) | 1,000 (30K min) | 1M (30M min) |
|---|---|---|---|---|---|
| **Gemini Live** | $0.025 | ~$8 | ~$75 | ~$750 | **~$750K** |
| **Cartesia (Scale)** | $0.014–0.03 | free–$9 | ~$45–90 | ~$420–900 | ~$420K–900K |
| **Bolna** | $0.07 | ~$21 | ~$210 | ~$2.1K | ~$2.1M |
| **ElevenLabs** | $0.09 | ~$27 | ~$270 | ~$2.7K | ~$2.7M |
| **Pipecat (Cloud)** | $0.09 | ~$27 | ~$270 | ~$2.7K | ~$2.7M |
| **LiveKit** | $0.12 | ~$36 | ~$360 | ~$3.6K | ~$3.6M |
| **OpenAI Realtime** | $0.15 (blend) | ~$45 | ~$450 | ~$4.5K | ~$4.5M |
| **Retell** | $0.18 | ~$54 | ~$540 | ~$5.4K | ~$5.4M |
| **Vapi** | $0.20 | ~$60 | ~$600 | ~$6K | ~$6M |

**Caveats by tier:**
- **10 users (~300 min/mo):** most have a **free tier** that covers this (LiveKit Build, Gemini free tier, Pipecat self-host). Effectively $0 for everyone at this scale.
- **100 users:** trivial dollars; **plan minimums** dominate (LiveKit Ship $50, Cartesia/ElevenLabs starter tiers). Pick on latency/DX, not price.
- **1,000 users:** cost becomes real; **concurrency ceilings start to bite** — Gemini needs **Vertex** (3→1,000), LiveKit needs **Scale** (600), etc.
- **1M users (30M min/mo):** numbers shown are **linear upper bounds** — at this volume everyone negotiates **enterprise/volume discounts** (often 30–60% off), so real cost is materially lower. The *ordering* holds: Gemini Live ≪ Cartesia < Bolna < … < Vapi/Retell.

---

## 3. Latency ranking (best → worst)

1. **Cartesia Sonic** — 40–90ms TTS (best-in-class)
2. **ElevenLabs** — ~75ms TTS
3. **Gemini Live / OpenAI Realtime** — ~300–500ms full-loop (unified, no inter-service hops)
4. **Vapi** — sub-500ms claimed, but chaining 4–5 APIs adds cumulative "dead air"
5. **Retell** — 620ms typical, but community reports 2.5–5s in rigid mode
- **LiveKit / Pipecat** — transport adds only tens of ms; total latency = **whatever models you plug in**

> Unified brains (Gemini/OpenAI) avoid the multi-hop latency tax that orchestration platforms (Vapi/Retell) incur by stitching separate STT→LLM→TTS vendors.

---

## 4. Per-provider notes

- **Gemini Live** — cheapest all-in, low latency, unified, and **natively multilingual** (70+ languages incl. ~10 Indian languages — Hindi, Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Urdu — with auto-detect + mid-conversation language switching). Ceiling is ~3 concurrent on Dev API key → **Vertex AI (1,000/project)** for scale. *Our current provider.*
- **OpenAI Realtime** — strong quality; expensive uncached ($0.18–0.46/min), but **prompt caching + gpt-realtime-mini** drop it to $0.05–0.15. Token-billed like Gemini.
- **Cartesia Line** — fastest TTS (Sonic, 40–90ms), cheap at Scale ($0.014). Bundled agent platform with folder-based KB. *Our benchmark provider.*
- **ElevenLabs Conv. AI** — best voice quality reputation; $0.08–0.10/min; rich agent builder + KB.
- **Vapi** — convenient orchestration/BYO-models, big integration surface, but real cost $0.13–0.31 and multi-hop latency.
- **Retell** — similar to Vapi; HIPAA on standard; latency inconsistent (mode-dependent).
- **Bolna** — **India-focused, telephony-native** (its real edge): SIP/PSTN phone channel, Indian carriers, INR pricing, aggressive rates ($0.04–0.10), offers OpenAI Realtime models in India. Note: multilingual/Indian-language capability is **not** a differentiator vs Gemini Live (which already covers ~10 Indian languages) — Bolna's value is putting a voice agent on a *phone call* cheaply in India.
- **LiveKit** — open-source WebRTC + agents framework; $0.01/min transport + your models. Max control, you assemble the stack. Scale tier = 600 concurrent.
- **Pipecat** — open-source framework (by Daily); self-host free (+ model costs) or Pipecat Cloud $0.01/min. Cheapest at scale if you self-host, but you build/operate it.

> **Telephony note:** Vapi/Retell/Bolna/Pipecat/LiveKit can front a **phone number** (SIP/PSTN). Gemini Live/OpenAI/Cartesia/ElevenLabs are the *brains*; to put them on a phone call you'd add a telephony layer (e.g. **Vobiz**, Twilio, Plivo).

---

## 5. Recommendation for Vyaz

- **Stay on Gemini Live** — it's the cheapest all-in ($0.02–0.03/min), low-latency, unified, and already integrated. Nothing here beats it on cost-per-minute for our web/browser (no-telephony) architecture. Scale via **Vertex AI** for concurrency.
- **Cartesia** stays the quality/latency benchmark (fastest TTS) — keep as the alt provider.
- **Bolna** is the one worth watching **only if** you pursue an India **phone-based** channel (dial-a-number, no app) — its edge is telephony, not language. Gemini Live already handles Indian languages, so multilingual is *not* a reason to switch.
- **Vapi / Retell** — convenience platforms; not worth their 5–10× cost premium for us.
- **LiveKit / Pipecat** — only if you decide to fully self-host the pipeline for control/cost at very large scale (they don't reduce model cost, just transport).

**Bottom line:** for Vyaz's current architecture and stage, **Gemini Live remains the right default** — cheap, low-latency, unified, *and* already multilingual (incl. Indian languages). The only provider that could change the calculus is **Bolna**, and only if a **phone-based** India channel (no app, dial a number) becomes a priority — a distribution decision, not a language or quality one.

---

## Sources
Gemini: [pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Live limits](https://firebase.google.com/docs/ai-logic/live-api/limits-and-specs) — OpenAI: [Realtime pricing](https://developers.openai.com/api/docs/pricing) — Cartesia: [pricing](https://www.cartesia.ai/pricing) — ElevenLabs: [agents pricing](https://elevenlabs.io/pricing/agents) — Vapi: [pricing](https://vapi.ai/pricing) — Retell: [pricing](https://www.retellai.com/pricing) — Bolna: [pricing](https://www.bolna.ai/pricing) — LiveKit: [pricing](https://livekit.com/pricing) — Pipecat: [Cloud pricing](https://www.daily.co/pricing/pipecat-cloud/)
