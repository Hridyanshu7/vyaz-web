# Vyaz — TODO-3: Booking Flow Redesign

*Last updated: June 29, 2026*

---

## Problem

Current booking flow has 4 gaps:
1. No narrator selection step — auto-picks first narrator
2. Schedule is a full page — should be a modal
3. No group sessions on homepage
4. No seat availability validation for group joins
5. No fallback when no narrator is attached to a title

---

## Correct Flows

### Flow A: Book a Gist/Chapter Session

```
User clicks "Gist Session" or chapter "Book" on BookDetail
    ↓
If not logged in → signup modal (with gist/chapter context)
    ↓
If logged in:
    ↓
Are there narrators for this book?
    ├── YES → Narrator picker modal
    │         Show all narrators for this book
    │         Each card: avatar, name, rating, "Select" button
    │         User picks one
    │              ↓
    │         Slot picker modal (replaces narrator picker in same modal)
    │         Week-view calendar with available slots
    │         Duration selector (30/45/60 min)
    │         1:1 vs Group toggle
    │         "Confirm booking" button
    │              ↓
    │         Session created in Supabase + GCal event
    │         Confirmation shown in modal → close
    │
    └── NO → "No narrators available" message
             "Request a session" button
             Inserts into session_requests table
             "We'll notify you when a narrator is available"
```

### Flow B: Join a Group Session

```
User sees group session card (on homepage or book detail)
    ↓
Card shows: narrator, book, date/time, seats (e.g., "7/20 joined")
    ↓
User clicks "Join"
    ↓
If not logged in → signup modal (with join context) → auto-join after auth
    ↓
If logged in:
    ↓
Check seat availability (attendees < max_attendees)
    ├── Seats available → insert session_attendee → show confirmation → reload
    └── Full → show "Session full" message, disable Join button
```

### Flow C: Group Sessions on Homepage

```
Homepage section: "Upcoming Sessions"
    ↓
Shows group sessions sorted by recency (soonest first)
    ↓
Each card: book cover + title, narrator name + avatar, date/time, seats remaining, "Join" button
    ↓
Clicking "Join" → Flow B above
    ↓
"View all" link → /books (browse page) or future /sessions page
```

---

## What to Build

### 1. Booking Modal (replaces Schedule page)

A single modal component `BookingModal` with 3 steps:

**Step 1: Narrator Selection**
- Shows all narrators for the book
- Each card: avatar, name, bio snippet, rating, review count
- "Select" button per narrator
- If no narrators: "No narrators available" + "Request a session" CTA

**Step 2: Slot Picker**
- Week-view calendar (existing Schedule page logic, moved into modal)
- Duration selector (30/45/60)
- 1:1 vs Group toggle + capacity selector (for group)
- Real GCal freeBusy availability (existing)
- "Confirm booking" button

**Step 3: Confirmation**
- "Session booked!" with meeting link
- "Go to Dashboard" and "Back to book" buttons

### 2. Homepage Upcoming Sessions Section

- New section between "Why Vyaz?" and "Meet a narrator"
- Queries `sessions` table for upcoming group sessions (status = 'open', scheduled_at > now)
- Shows top 3-5 sorted by soonest
- Each card: book cover thumbnail, book title, narrator name + avatar, date/time, seats (e.g., "7/20"), "Join" button
- "Join" triggers Flow B
- Empty state: "No upcoming sessions yet. Browse books to find narrators."

### 3. Seat Availability Validation

- Before inserting `session_attendee`, check count vs `max_attendees`
- If full: show error, disable Join button
- In `useBookSessions` hook: already filtering `(attendees < max_attendees)` ✅
- Add DB-level check: Supabase RLS or Edge Function to prevent over-joining

### 4. "No Narrator" Fallback

- In BookDetail: if `narrators.length === 0`, the "Gist Session" and "By Chapter" buttons still show
- Clicking them opens a "No narrators available for this book yet" message
- With a prominent "Request a session" CTA
- Same for the Booking Modal Step 1

### 5. Remove Schedule Page

- Delete `/book/:bookId/narrator/:narratorId/schedule` route
- Delete `src/pages/Schedule.jsx`
- All booking happens through the `BookingModal`

---

## Files to Create/Modify

| File | Action |
|---|---|
| `src/components/BookingModal.jsx` | **Create** — narrator picker + slot picker + confirmation |
| `src/pages/Home.jsx` | **Modify** — add upcoming sessions section |
| `src/pages/BookDetail.jsx` | **Modify** — wire Gist/Chapter CTAs to BookingModal |
| `src/hooks/useUpcomingSessions.js` | **Create** — fetch upcoming group sessions for homepage |
| `src/pages/Schedule.jsx` | **Delete** — replaced by BookingModal |
| `src/App.jsx` | **Modify** — remove Schedule route |

---

## Implementation Order

| # | Task | Effort |
|---|---|---|
| 1 | Build `BookingModal` with 3 steps (narrator select → slot picker → confirm) | 3-4 hrs |
| 2 | Wire BookDetail CTAs to open BookingModal instead of navigating to Schedule | 30 min |
| 3 | Add "no narrator" fallback with Request CTA | 30 min |
| 4 | Add seat validation before group join | 30 min |
| 5 | Build `useUpcomingSessions` hook | 30 min |
| 6 | Add upcoming sessions section to Homepage | 1 hr |
| 7 | Delete Schedule page + route | 15 min |
| 8 | Test all flows end-to-end | 1 hr |
| **Total** | | **~7 hrs** |
