# Vyaz — SQL Query Runbook

_Curated medium/high-value queries for debugging and operating Vyaz. Run in **Supabase → SQL Editor** (it runs as service-role, so RLS never blocks these). Last updated: 2026-07-09._

> Schema notes: book content lives in `books.chapters` (JSONB: `[{number,title,oneliner,content,sections:[{number,title,text,cartesia_document_id}]}]`). `voice_events` is the voice-agent observability table (see migration `005`). `voice_sessions` (migrations `008`/`009`) is the durable per-session transcript + rating history, shared across all three voice providers — each agent turn may also carry a `feedback:{thumbs,remarks}` field (thumbs up/down, Gemini Live only, DECISIONS A16). `book_content_blocks` (migration `010`) holds the structured EPUB parse (`heading`/`paragraph`/`list`/`table`/`image`/`svg` blocks), one row per book+chapter — separate from `books.chapters` to keep it lean (DECISIONS B7/B8). Extracted images live in the public **`book-assets`** Storage bucket (migration `011`), queryable directly via `storage.objects`. For the *why* behind the system, see [DECISIONS.md](DECISIONS.md); for structure, [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 🎙️ Voice agent observability (`voice_events`)

### Recent drops + their cause
→ Why did sessions stop? `intentional:false` = an unexpected drop.
```sql
select created_at,
       detail->>'code' as code,
       detail->>'reason' as reason,
       (detail->>'durationMs')::bigint / 1000 as duration_s,
       detail->>'intentional' as intentional
from voice_events
where type = 'ws_close'
order by created_at desc
limit 30;
```

### Drop-cause breakdown (unexpected drops only)
→ Is it the ~15-min limit (code 1011 at ~900s) or network (varied codes, short)?
```sql
select detail->>'code' as code,
       count(*) as drops,
       round(avg((detail->>'durationMs')::bigint) / 1000) as avg_duration_s,
       max((detail->>'durationMs')::bigint) / 1000 as max_duration_s
from voice_events
where type = 'ws_close' and detail->>'intentional' = 'false'
group by 1
order by drops desc;
```

### Sessions that got a `go_away` (server warned of imminent cutoff)
→ Confirms hitting the connection time limit.
```sql
select created_at, session_id, detail->>'timeLeft' as time_left
from voice_events
where type = 'go_away'
order by created_at desc
limit 30;
```

### Full timeline of ONE session
→ Replay everything that happened in a specific session.
```sql
select created_at, type, detail
from voice_events
where session_id = 'PASTE_SESSION_ID'
order by created_at;
```

### Errors (WS + server)
```sql
select created_at, session_id, type, detail
from voice_events
where type in ('ws_error', 'server_error')
order by created_at desc
limit 30;
```

### Session-length distribution (minutes)
→ How long do sessions actually run? (spot the cluster near the ~15-min wall)
```sql
select round((detail->>'durationMs')::bigint / 60000) as duration_min, count(*)
from voice_events
where type in ('session_end', 'ws_close') and detail ? 'durationMs'
group by 1 order by 1;
```

### Daily starts vs. unexpected drops (reliability trend)
```sql
select date(created_at) as day,
       count(*) filter (where type = 'session_start') as starts,
       count(*) filter (where type = 'ws_close' and detail->>'intentional' = 'false') as drops
from voice_events
group by 1 order by day desc
limit 14;
```

### Most-used chapters (voice demand)
```sql
select b.title, ve.chapter_number, count(*) as sessions
from voice_events ve
join books b on b.id = ve.book_id
where ve.type = 'session_start'
group by 1, 2
order by sessions desc
limit 20;
```

### Table growth (housekeeping)
```sql
select type, count(*), min(created_at) as first, max(created_at) as last
from voice_events group by type order by 2 desc;
```

---

## 🗣️ Voice session history & feedback (`voice_sessions`)

### Recent sessions overview
```sql
select vs.session_id, p.name as user, b.title, vs.chapter_number, vs.mode, vs.provider,
       vs.started_at,
       extract(epoch from (vs.ended_at - vs.started_at))::int / 60 as duration_min,
       vs.rating, vs.feedback_text,
       jsonb_array_length(coalesce(vs.data->'turns', '[]'::jsonb)) as turn_count
from voice_sessions vs
left join profiles p on p.id = vs.user_id
left join books b on b.id = vs.book_id
order by vs.started_at desc
limit 30;
```

### Average rating + rated-vs-total, by provider
```sql
select provider,
       round(avg(rating), 2) as avg_rating,
       count(rating) as rated_sessions,
       count(*) as total_sessions,
       round(100.0 * count(rating) / count(*), 1) as pct_rated
from voice_sessions
group by 1
order by 1;
```

### Low-rated sessions to review (1-2★, with the free-text remark)
```sql
select vs.session_id, b.title, vs.chapter_number, vs.rating, vs.feedback_text, vs.started_at
from voice_sessions vs
left join books b on b.id = vs.book_id
where vs.rating <= 2
order by vs.started_at desc;
```

### Full timeline of ONE session (transcript + turn-level feedback)
```sql
select turn->>'role' as role,
       turn->>'text' as text,
       turn->'feedback'->>'thumbs' as thumbs,
       turn->'feedback'->>'remarks' as remarks,
       to_timestamp(((turn->>'ts')::bigint) / 1000) as turn_time
from voice_sessions vs
cross join lateral jsonb_array_elements(coalesce(vs.data->'turns', '[]'::jsonb)) as turn
where vs.session_id = 'PASTE_SESSION_ID'
order by turn_time;
```

### Thumbs up/down aggregate across all agent turns (Gemini Live)
```sql
select turn->'feedback'->>'thumbs' as thumbs, count(*)
from voice_sessions vs
cross join lateral jsonb_array_elements(coalesce(vs.data->'turns', '[]'::jsonb)) as turn
where turn->>'role' = 'agent' and turn ? 'feedback'
group by 1;
```

### Thumbs-down turns with a reason (quality-issue triage)
```sql
select vs.session_id, b.title, vs.chapter_number,
       left(turn->>'text', 200) as agent_text,
       turn->'feedback'->>'remarks' as remarks,
       to_timestamp(((turn->>'ts')::bigint) / 1000) as turn_time
from voice_sessions vs
left join books b on b.id = vs.book_id
cross join lateral jsonb_array_elements(coalesce(vs.data->'turns', '[]'::jsonb)) as turn
where turn->>'role' = 'agent' and turn->'feedback'->>'thumbs' = 'down'
order by turn_time desc;
```

### Sessions that never got rated (abandoned the rating screen)
```sql
select provider,
       count(*) filter (where rating is null) as unrated,
       count(*) as ended_sessions,
       round(100.0 * count(*) filter (where rating is null) / count(*), 1) as pct_unrated
from voice_sessions
where ended_at is not null
group by 1;
```

### Most active users by session count
```sql
select p.name, p.email, count(*) as sessions, max(vs.started_at) as last_session
from voice_sessions vs
join profiles p on p.id = vs.user_id
group by 1, 2
order by sessions desc
limit 20;
```

---

## 📚 Content health (`books` / chapters / sections)

### Per-book overview: chapters, sections, KB sync, language
```sql
select title, is_published, language,
       jsonb_array_length(coalesce(chapters, '[]'::jsonb)) as chapters,
       (select count(*)
          from jsonb_array_elements(coalesce(chapters, '[]'::jsonb)) as ch,
               jsonb_array_elements(coalesce(ch->'sections', '[]'::jsonb)) as sec) as sections,
       (cartesia_folder_id is not null) as kb_synced
from books
order by title;
```

### Chapters that have content but NO sections (need "Split")
```sql
select b.title, (ch->>'number') as chapter, (ch->>'title') as chapter_title
from books b, jsonb_array_elements(coalesce(b.chapters, '[]'::jsonb)) ch
where (ch ? 'content') and coalesce(jsonb_array_length(ch->'sections'), 0) = 0
order by b.title;
```

### Oversized chapters (>8000 words — likely mis-chunked)
→ e.g. the *Hard Thing* ch1 that lumped in the front matter.
```sql
select b.title, (ch->>'number') as chapter, (ch->>'title') as chapter_title,
       array_length(regexp_split_to_array(trim(ch->>'content'), '\s+'), 1) as words
from books b, jsonb_array_elements(coalesce(b.chapters, '[]'::jsonb)) ch
where ch ? 'content'
  and array_length(regexp_split_to_array(trim(ch->>'content'), '\s+'), 1) > 8000
order by words desc;
```

### Books not synced to Cartesia KB
```sql
select title from books
where cartesia_folder_id is null and chapters is not null
order by title;
```

### Books by language
```sql
select coalesce(language, '(unset)') as language, count(*)
from books group by 1 order by 2 desc;
```

---

## 🧩 Structured content blocks (`book_content_blocks`)

### Block-type breakdown per chapter (verify EPUB parse quality)
→ Use this after re-parsing a book to sanity-check what actually got extracted — includes
the `role` (sidebar/tip/note) and `page` tagging added when the aside-stripping bug was fixed.
```sql
select b.title, bcb.chapter_number,
       count(*) filter (where blk->>'type' = 'heading')   as headings,
       count(*) filter (where blk->>'type' = 'paragraph') as paragraphs,
       count(*) filter (where blk->>'type' = 'list')      as lists,
       count(*) filter (where blk->>'type' = 'table')     as tables,
       count(*) filter (where blk->>'type' = 'image')     as images,
       count(*) filter (where blk->>'type' = 'svg')       as svgs,
       count(*) filter (where blk ? 'role')               as role_tagged,
       count(*) filter (where blk ? 'page')               as page_tagged
from book_content_blocks bcb
join books b on b.id = bcb.book_id
cross join lateral jsonb_array_elements(bcb.blocks) as blk
group by 1, 2
order by b.title, bcb.chapter_number;
```

### Chapters never re-parsed with the new blocks pipeline
→ Books ingested before the structured-content-model shipped (2026-07-09) have no row here yet —
narration still works (derived from `books.chapters`), they just have no rich blocks.
```sql
select b.title, (ch->>'number')::int as chapter_number, ch->>'title' as chapter_title
from books b, jsonb_array_elements(coalesce(b.chapters, '[]'::jsonb)) ch
where not exists (
  select 1 from book_content_blocks bcb
  where bcb.book_id = b.id and bcb.chapter_number = (ch->>'number')::int
)
order by b.title, chapter_number;
```

### Image blocks with a missing upload URL (failed Storage upload)
```sql
select b.title, bcb.chapter_number, blk->>'alt' as alt, blk->>'caption' as caption
from book_content_blocks bcb
join books b on b.id = bcb.book_id
cross join lateral jsonb_array_elements(bcb.blocks) as blk
where blk->>'type' = 'image' and (blk->>'assetUrl') is null
order by b.title, bcb.chapter_number;
```

### Role-tagged content (sidebars/tips/notes/practice boxes)
```sql
select b.title, bcb.chapter_number, blk->>'role' as role, left(blk::text, 120) as preview
from book_content_blocks bcb
join books b on b.id = bcb.book_id
cross join lateral jsonb_array_elements(bcb.blocks) as blk
where blk ? 'role'
order by b.title, bcb.chapter_number;
```

### Inline SVG charts captured
```sql
select b.title, bcb.chapter_number, blk->>'title' as svg_title, blk->>'desc' as svg_desc
from book_content_blocks bcb
join books b on b.id = bcb.book_id
cross join lateral jsonb_array_elements(bcb.blocks) as blk
where blk->>'type' = 'svg'
order by b.title, bcb.chapter_number;
```

### Table growth (housekeeping)
```sql
select count(*) as chapter_rows,
       sum(jsonb_array_length(blocks)) as total_blocks,
       pg_size_pretty(pg_total_relation_size('book_content_blocks')) as table_size
from book_content_blocks;
```

---

## 🖼️ Book assets storage (`book-assets` bucket via `storage.objects`)

### Files + size per book
```sql
select b.title, count(*) as files,
       pg_size_pretty(sum((o.metadata->>'size')::bigint)) as total_size
from storage.objects o
join books b on b.id::text = split_part(o.name, '/', 1)
where o.bucket_id = 'book-assets'
group by 1
order by sum((o.metadata->>'size')::bigint) desc;
```

### Total bucket size
```sql
select count(*) as total_files,
       pg_size_pretty(sum((metadata->>'size')::bigint)) as total_size
from storage.objects
where bucket_id = 'book-assets';
```

---

## 👤 Users (`profiles`)

### Snapshot: totals, admins, new this week
```sql
select count(*) as total,
       count(*) filter (where is_admin) as admins,
       count(*) filter (where is_active is not false) as active,
       count(*) filter (where created_at > now() - interval '7 days') as new_7d
from profiles;
```

### Recent signups
```sql
select created_at, name, email, phone, role, is_admin
from profiles order by created_at desc limit 30;
```

### Narrators (role = narrator / both)
```sql
select name, email, role, created_at
from profiles where role in ('narrator', 'both')
order by created_at desc;
```

---

## 📅 Human narrator sessions

### Upcoming sessions + live attendee counts
```sql
select s.scheduled_at, b.title, p.name as narrator, s.type, s.status, s.max_attendees,
       (select count(*) from session_attendees a
          where a.session_id = s.id and a.status <> 'cancelled') as attendees
from sessions s
join books b on b.id = s.book_id
join profiles p on p.id = s.narrator_id
where s.scheduled_at > now()
order by s.scheduled_at
limit 30;
```

### Pending session requests (unmet demand)
```sql
select r.created_at, b.title, p.name as reader, r.preferred_type, r.message
from session_requests r
join books b on b.id = r.book_id
join profiles p on p.id = r.reader_id
where r.status = 'pending'
order by r.created_at desc;
```

---

## ⚙️ Config (`platform_settings`)

### Current voice config (secrets redacted)
```sql
select key,
       case when key ilike '%api_key%' or key ilike '%secret%' then '••• hidden' else value end as value,
       updated_at
from platform_settings
where key in ('voice_provider', 'live_model', 'live_voice',
              'pipeline_stt_model', 'pipeline_llm_model', 'pipeline_tts_model', 'pipeline_tts_voice')
order by key;
```

---

## 🧹 Operational / cleanup

### Orphaned voice_progress (book was deleted)
```sql
select vp.* from voice_progress vp
left join books b on b.id = vp.book_id
where b.id is null;
```

### Orphaned book-assets (book was deleted but its images weren't cleaned up)
→ `book-delete` purges this bucket folder on delete (migration `011`-adjacent), so this
should normally be empty — a non-empty result means the cleanup step failed for that book.
```sql
select o.name, o.created_at
from storage.objects o
where o.bucket_id = 'book-assets'
  and not exists (select 1 from books b where b.id::text = split_part(o.name, '/', 1))
order by o.created_at desc;
```

### Voice progress overview (Pipeline provider only — Live doesn't write here)
```sql
select vp.session_id, b.title, vp.chapter_number,
       coalesce(array_length(vp.completed_sections, 1), 0) as done, vp.total_sections
from voice_progress vp
left join books b on b.id = vp.book_id
order by vp.session_id desc
limit 30;
```
