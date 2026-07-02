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

