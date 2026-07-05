# Vyaz — SQL Query Runbook

_Curated medium/high-value queries for debugging and operating Vyaz. Run in **Supabase → SQL Editor** (it runs as service-role, so RLS never blocks these). Last updated: 2026-07-05._

> Schema notes: book content lives in `books.chapters` (JSONB: `[{number,title,oneliner,content,sections:[{number,title,text,cartesia_document_id}]}]`). `voice_events` is the voice-agent observability table (see migration `005`). For the *why* behind the system, see [DECISIONS.md](DECISIONS.md); for structure, [ARCHITECTURE.md](ARCHITECTURE.md).

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

## 👤 Users (`profiles`)

### Snapshot: totals, admins, GCal, new this week
```sql
select count(*) as total,
       count(*) filter (where is_admin) as admins,
       count(*) filter (where is_active is not false) as active,
       count(*) filter (where gcal_connected) as gcal_connected,
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

### Voice progress overview (Pipeline provider only — Live doesn't write here)
```sql
select vp.session_id, b.title, vp.chapter_number,
       coalesce(array_length(vp.completed_sections, 1), 0) as done, vp.total_sections
from voice_progress vp
left join books b on b.id = vp.book_id
order by vp.session_id desc
limit 30;
```
