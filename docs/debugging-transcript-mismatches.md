# Debugging: agent speech-bubble text doesn't match the audio

_A runbook for investigating reports like "words were missing/rearranged in the narrator's speech bubble." Distinct from the general [sql-queries.md](sql-queries.md) — this is a focused diagnostic workflow for one specific symptom class. Last updated: 2026-07-08._

## The symptom
A user reports (often via a session rating's `feedback_text`) that what they heard the narrator say doesn't match what appeared in that turn's speech bubble — words missing, or reading out of order relative to the audio.

## Why this can happen (architecture background)
See [DECISIONS.md](DECISIONS.md) **A10** and **A11**. The short version: **audio and its transcription are two independent streams** from the Gemini Live API — they are not delivered as one atomic unit. The client anchors a "bubble" to whichever of the two arrives first for a turn, and resets that anchor on `turnComplete`/`interrupted`.

Three known, ranked-by-likelihood causes:

1. **Trailing-transcription skew (the most likely, and an accepted trade-off).** A10 originally fixed a worse bug — "lazy reset" caused the *next* turn's opening words to glue onto the *previous* bubble ("beginning-eating"). The fix (eager reset on `turnComplete`) closes that hole but re-opens a narrower one: if a trailing transcription chunk for what the user just heard arrives **after** the next turn's audio has already started, it gets appended to the **new** bubble instead of the one it belongs to. Net effect: the bubble matching what was just heard looks short/missing words, and the next bubble has extra leading text that doesn't match its own audio.
2. **Session resumption boundary (A11).** If the session ran long enough to hit a reconnect (~15 min limit), we've verified narration *continues* — but never specifically verified **word-perfect transcription continuity right at the reconnect boundary**.
3. **The ephemeral-token / `v1alpha` `BidiGenerateContentConstrained` switch** (moving the real API key off the browser). This changed the actual endpoint Gemini serves the connection from (`v1beta` → `v1alpha`). We confirmed narration + reconnect still *work* afterward, but never specifically re-verified that output-transcription chunking/timing is identical to `v1beta`. Speculative, not confirmed.

## Diagnostic workflow (uses `voice_sessions` + `voice_events`)

Run in **Supabase → SQL Editor** (service-role, RLS doesn't block these).

### 1. Find the exact session
If the report came with a rating/comment, search by the feedback text directly — no need to rely on anyone's memory of timing:
```sql
select id, session_id, book_id, chapter_number, provider, started_at, ended_at, rating, feedback_text
from voice_sessions
where feedback_text ilike '%<keyword from their comment>%'
order by started_at desc
limit 3;
```
Otherwise, narrow by approximate time and/or user:
```sql
select id, session_id, provider, started_at, ended_at, rating, feedback_text
from voice_sessions
where started_at > now() - interval '1 day'
order by started_at desc;
```

### 2. Pull the full transcript, in order, with per-turn timestamps
(`data.turns[i].ts` is stamped once at turn creation — see DECISIONS, `adminStore.js`.)
```sql
select
  t.ord,
  t.value ->> 'role' as role,
  t.value ->> 'text' as text,
  to_timestamp((t.value ->> 'ts')::bigint / 1000.0) as turn_time
from voice_sessions vs,
     jsonb_array_elements(vs.data -> 'turns') with ordinality as t(value, ord)
where vs.id = <PASTE_ID_FROM_STEP_1>
order by t.ord;
```
Read it top to bottom. Look for: a bubble that seems to cut off mid-thought (missing trailing words), or a bubble whose *opening* words feel like they belong to the previous turn's audio instead of its own.

### 3. Cross-reference technical events for the same session
```sql
select type, detail, created_at
from voice_events
where session_id = (select session_id from voice_sessions where id = <PASTE_ID_FROM_STEP_1>)
order by created_at;
```
- A `go_away` / `reconnect_attempt` event with a timestamp landing inside the suspicious turn's time range → points at cause **#2** (reconnect boundary).
- No reconnect event at all → points at cause **#1** (trailing-skew) or **#3** (v1alpha timing), not resumption.
- A `missing_transcript` event (logged when audio played but `outputTranscription` never arrived that turn) → a distinct, more severe case — the words are gone entirely, not just misplaced.

## What NOT to do
Don't "fix" a suspected mismatch by tuning the system prompt (`live_system_prompt`) — this class of bug is a **client-side render/buffer/transport issue** (text the model *did* produce being dropped or misattributed downstream), not a prompt-governed behavior. See the prompt-vs-code boundary principle in memory / DECISIONS A10.
