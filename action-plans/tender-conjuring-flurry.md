# Vyaz — Voice Agent Action Items

## Needs action / verification
1. **Test the verbatim rework** (just shipped, unconfirmed) — verify: parens are silent in audio, agent reads verbatim (not paraphrasing), progress bar + section states stay in sync.
2. **Re-run "Split sections" on existing books (coverage fix) — must be LOSSLESS.**
   - **Verified 2026-07-02:** existing books drop words. *Zero to One* = 99% overall but **ch 18 = 82%**; *The Hard Thing About Hard Things* = 98% overall but **ch 18 = 38%** (~62% of that chapter missing). Cause: the old chunker dropped every paragraph ≤40 chars.
   - The corrected splitter (`splitIntoSections`, merge-not-drop, in `src/lib/sections.js`) is deployed — but it only applies to **new** splits.
   - **Caveat:** the current `splitSections` in `AdminPanel.jsx` (~line 483) *overwrites* the sections array, and `splitIntoSections` returns only `{number, text}` — so a naive re-split **wipes section `title`s** (progress-tracker labels) **and `cartesia_document_id`** (KB mapping).
   - **Fix approach (lossless re-split):** after building the new chunks, carry over `title` and `cartesia_document_id` from the old sections where content still aligns (match by text overlap / order); anything unmappable → regenerate titles via `generateOneliners` and re-sync Cartesia KB. Then assert `sectionCoverage()` === 100% for every chapter before saving.
   - **Verify:** post re-split, `sectionCoverage` = 100% per chapter; titles present; Cartesia IDs intact or re-synced.
3. **`((...))` audio fallback** — if TTS vocalizes the parens in testing, switch to a marker less likely to be spoken.

## Parked (agreed, awaiting later)
4. **RAG / tool-calling for Gemini Live** — retrieval instead of full-chapter stuffing (cost + cross-chapter Q&A). Marked as "next likely work" in memory.
5. **Server-side chapter↔section validation** — edge function currently trusts client-sent sections; parked hardening.
6. **Sarvam + Smallest.ai providers** — blocked on API keys / sales-gated pricing.

## Noted but decided against / low priority
7. **`bookStore` eager-load trim** — public store loads all chapters via `select('*')`; you chose to keep it client-side, so no action.
8. **Disable input transcription** — minor cost saving, but we keep it for your speech bubbles.

## Generation parameters (Gemini Live) — planned build
9. **`AdminPanel.jsx` → `GeminiLiveCard`**: add `live_temperature`, `live_top_p`, `live_max_output_tokens` to `useProviderSettings`; render 3 number inputs (defaults: temp 0.2, top_p 0.8, max tokens blank).
10. **`voice-session/index.ts`**: fetch those 3 keys; return `liveTemperature` (def 0.2), `liveTopP` (def 0.8), `liveMaxOutputTokens` (only if set).
11. **`geminiLive.js`**: accept the 3 in constructor; in `_openSocket()` `generationConfig` set `temperature` + `topP` always, `maxOutputTokens` only if defined.
12. **Skip**: penalties, Top K, candidateCount, seed (harmful or N/A for verbatim).
13. **Deploy**: build → deploy edge fn → commit/push → Vercel prod.
14. **Verify**: temp 0.2/topP 0.8 → steady verbatim + progress; temp 0.9 → more drift (knob works).

## Talk button auth gate (bug fix)

**Context:** Signed-out users can open the Talk (Gemini Live narration) modal without signing up — every other chapter action (`gist`, `chapter`, `join`) gates behind the signup modal via `if (!user) { showSignup(...) }`, but the Talk button ([BookDetail.jsx:244](src/pages/BookDetail.jsx#L244)) skips it.

15. **`BookDetail.jsx`** (Talk `onClick`, line ~244): before `setVoiceChapter(ch)`, add `if (!user) { showSignup({ type: 'talk', bookId: id }); return }`. (`user` from `useAuthStore` and `showSignup` from `useSignupModal` are already in scope.)
16. **`SignupModal.jsx`**: add `case 'talk':` to the existing `case 'gist': case 'chapter':` block in the post-signup redirect switch (line ~210) so it lands back on the book page. Leave `'talk'` OUT of `NEEDS_CALENDAR` (line 13) — AI narration needs no calendar onboarding.
17. **Verify**: signed out → click Talk → signup modal (not narration modal); complete signup → back on book page, no calendar step forced; signed in → Talk opens narration directly.

## WhatsApp OTP login (future integration)

**Context:** WhatsApp/phone OTP login is currently **HIDDEN** in the UI — `SignupModal.jsx` (behind `PHONE_LOGIN_ENABLED = false`) and the `/login` page (Email/Phone toggle + phone form removed). Active methods: **Google, LinkedIn, email magic-link**. It was hidden because no messaging provider is wired *and* the flow was a dead-end (new numbers can't register; the modal called `signInWithOtp({phone})` with no `channel:'whatsapp'` so it'd send SMS, not WhatsApp, and no SMS/WhatsApp provider is configured in Supabase).

18. **Pick a provider.** *AiSensy* (India-native, ~₹0.145/OTP, free tier ~340 OTPs — but NOT a Supabase phone provider → requires a **custom** OTP flow) **or** *Twilio Verify* WhatsApp channel (native Supabase provider, pricier, minimal code).
19. **WhatsApp Business API onboarding** (required for any provider): verified WABA sender (a number not on the consumer WhatsApp app), Business Manager verification, and an **approved authentication (OTP) template** (Meta approval, takes days).
20. **Wire it up:** *Twilio* → configure in Supabase → Auth → Phone, and pass `channel: 'whatsapp'` in `signInWithOtp`. *AiSensy* → build a custom edge-function flow (generate + send OTP via AiSensy API, verify server-side, then create the Supabase session).
21. **Build the phone sign-up form.** New/unregistered numbers currently dead-end — `handleSendOtp` blocks them with "fill details below," but that form doesn't exist. Add name-collection + profile creation.
22. **Un-hide the UI:** set `PHONE_LOGIN_ENABLED = true` in `SignupModal.jsx` and restore the toggle + phone form in `Login.jsx`.

## Voice modal UI standardization

**Context:** Three provider modals (`GeminiLiveModal`, `VoicePipelineModal`, `VoiceAgentModal`) grew separate UIs across the provider pivots (Cartesia → pipeline → Gemini Live) and have drifted — different layouts, and only the Cartesia `VoiceAgentModal` has a Mute button. Gemini Live is the committed provider, so its modal is the one to standardize on (and likely retire/consolidate the other two).

23. **Standardize UI of the Voice Agent Session modal** — unify on one consistent layout for the Talk session; this should have the **Mute button** carried over from the Cartesia modal (`VoiceAgentModal`), which `GeminiLiveModal` currently lacks.

