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

## P2P removal → AI-only pivot

**Context:** Product pivot to AI-only narration — all human-narrator/P2P surfaces removed; humans are only users. Decisions: no data export (only 2 users, both narrator+listener; hard-drop); narrator role/columns deleted outright (human narration never returns); "Gist Session" button kept but becomes an **AI** feature (no P2P); `gcal` removed entirely; rollout **phased A→B→C→D**. Ordering rule: **code first, DB last** (dropping a table while code still queries it 404s prod and can crash the whole catalog/admin load via the `Promise.all` inits).

24. **✅ Phase A — hide P2P UI (shipped, PR #3).** Routes (`/narrators/:id`, `/dashboard`, `/dashboard/review`, `/availability`), Header link, BookGrid/BookCard narrator badge, BookDetail (AI-only; Gist→AI placeholder), Home (AI copy; sessions removed), Profile (role/gcal removed), Admin Group Sessions tab. Reversible — no code/DB deleted.
25. **Phase B — delete dead code.** Remove P2P pages (`NarratorProfile`, `Dashboard`, `PostSession`, `Availability`, `Schedule`), components (`BookingModal`, `narrators/NarratorCard`, `AvailabilityPicker`), hooks (`useSessions`, `useUpcomingSessions`, `useBookings`, `useAvailability`; check `usePresence`), `lib/calendar.js`. Remove `fetchNarrators`/`narrators`/`getNarratorsForBook` from `bookStore` and the `sessions`/`groupSessions` fetch from `adminDataStore` (**must leave both `initialize` `Promise.all`s valid**). **Rewrite `SignupModal`** — drop `onboarding_complete`/`gcal`/`role`/`availability`/`NEEDS_CALENDAR` + the P2P `session_attendees`/`availability` writes; keep `signin`/`getstarted`/`talk`. Remove the narrator onboarding gate in `Layout.jsx`. Remove the role `<select>` in `AdminPanel` Users tab + the `GroupSessions` component. Remove the `gcal` edge function; update `book-delete` to stop referencing `sessions`.
26. **🚦 Gate before Phase C.** `npm run build` clean **and** grep proves **zero** references remain to: `sessions`, `session_attendees`, `session_requests`, `bookings`, `reviews`, `availability`, `narrator_books`, `gcal`, `user_role`, `onboarding_complete`. Deploy the no-reference frontend and verify prod healthy **before** any DB drop.
27. **Phase C — drop DB (migration `007_remove_p2p.sql`).** Drop tables: `sessions`, `session_attendees`, `session_requests`, `narrator_books`, `availability`, `bookings`, `reviews`. Drop `profiles` columns: `role`, `bio`, `gcal_connected`, `gcal_refresh_token`, `onboarding_complete`. Drop the `user_role` enum + all RLS policies tied to the removed tables. Run in Supabase SQL editor **after** #26 passes. No backup (per decision — no data worth keeping).
28. **Phase D — docs & positioning.** CLAUDE.md / ARCHITECTURE.md / DECISIONS.md: rewrite the product one-liner (drop "human narrator sessions"), remove the sessions/narrator data-model + flow sections, add a **new ADR** for the AI-only pivot (the *why*: anti-slop, fidelity, conversation). Update `docs/design-language.html` + `docs/system-field-guide.html` (remove human-narrator mentions). Revisit pricing/unit-economics/personas (were P2P-marketplace framed). Add a `project` memory recording the pivot. (Repo/dir name `books-p2p` + remote `vyaz-web` become misnomers — cosmetic, don't rename lightly.)

## Noise & speaker robustness (see DECISIONS A12)

**Context:** Two separate problems. Ambient/stationary noise (café, factory hum) is cheap to attack; a second human *voice* (call-centre) is not — it needs a voiceprint (pitch alone is not an identifier). Approach is measurement-gated: ship the cheapest layer, measure against real environments, add heavier layers only on a measured failure. **Phase 0 done** — VAD schema verified against the live API (`realtimeInputConfig.automaticActivityDetection`: `disabled`, `startOfSpeechSensitivity`, `prefixPaddingMs`, `endOfSpeechSensitivity`, `silenceDurationMs`; camelCase).

29. **Baseline (yours to capture).** Run Talk in a noisy environment; note false interrupts, first-word clipping, and whether a faint voice registers. Gates everything below.
30. **Ambient Phase 1 — config only, no deps.** In `geminiLive.js`: set mic `autoGainControl: false`; add `prefixPaddingMs` (~200–300ms) to `automaticActivityDetection`; leave start sensitivity at default (protects faint voices). Also the fix for **user first-word clipping**. Measure vs #29.
31. **Ambient Phase 2 — WASM denoise (RNNoise)** in the mic path, *only if* Phase 1 leaves loud stationary noise (e.g. factory floor). Raises SNR so VAD can stay sensitive. Likely forces the AudioWorklet migration.
32. **Ambient Phase 3 — manual VAD** (disable auto-VAD; client-side detect + `activityStart`/`activityEnd`), *only if* Gemini's VAD knobs prove too coarse. Full control, more code.
33. **Target-speaker / voiceprint** (reject a second human voice). Separate larger build: enrol the user's voiceprint, run client-side speaker verification (ONNX/WASM embedding) to gate audio *before* Gemini (no server-side target-speaker hook exists). Denoise/VAD can't solve this; requires AudioWorklet.

## Scaling — concurrency / Vertex AI (see DECISIONS A3, D3)

**Context:** The real mass-usage wall. The Developer API allows only ~3 concurrent Live sessions per key — the 4th+ simultaneous listener is rejected. Catalog size is irrelevant; this is about *simultaneous* sessions.

34. **Migrate Gemini Live to Vertex AI** (~1,000 concurrent/project). Needs a GCP project + service-account auth — Vertex rejects the `?key=` browser connection and wants a short-lived OAuth token, so it pairs naturally with **moving the connection server-side** (which also closes the browser key-exposure risk). Vertex-only model IDs differ from the Developer API (A3). The path to scale; not started.

## Content ingestion — OCR (Sarvam Vision)

**Context:** Ingestion is EPUB-only today; the parser can't handle scanned / image-based PDFs (DECISIONS B4). **Sarvam Vision / Document Digitisation API** (3B VLM, English + 22 Indian languages, preserves structure/reading order, strong Indic OCR) would fill that gap and fits the India/multilingual + anti-slop direction. Research only for now (DECISIONS B6).

35. **OCR ingestion path (Sarvam Vision) — research → build later.** Add a second ingestion path alongside EPUB: upload scanned PDF/images → call Sarvam Document Digitisation **server-side via an edge function** (keep the key off the client — the Gemini-key-exposure lesson) → structured text → feed the existing **Generate → Split** steps (downstream unchanged). Watch-outs: **pricing after the Feb-2026 free window** (per-page × whole books — a one-time ingest cost, not per-listen); async/batch for long books; OCR only for scanned/image sources (native EPUB extraction stays better/cheaper); copyright of scanned commercial books; preview API. Verify current pricing/limits before building.

## Book Gist (AI) — re-enable

**Context:** Whole-book Gist is fully built (`voice-session` `mode:'gist'`, `GeminiLiveModal` gist mode, admin `live_gist_prompt`; DECISIONS A13) but the whole-book input exceeds the **current Gemini quota** → the live session errors with "exceeded quota / check billing." The **BookDetail button was removed 2026-07-07** so users don't hit a broken feature; the code is retained.

36. **Re-enable "Book Gist (AI)".** (1) Enable Gemini **billing / higher tier** (or Vertex #34); (2) author the gist prompt in Admin → Agents → Gemini Live (`live_gist_prompt`); (3) restore the Gist button + gist modal in `BookDetail.jsx` (search the comment "item 36"). For long books on a tight quota, consider a condensed context.

