# Vyaz — TODO-2: Book Demand Discovery & Request System

*Last updated: June 29, 2026*

---

## Objective

Allow users to register demand for any book — whether it's in the catalog or not. Aggregate this demand to drive catalog expansion, narrator recruitment, and marketplace growth. The request system should be the primary mechanism for scaling the catalog based on real user need, not guesswork.

---

## User-Facing: "What would you read if you had the time?"

### Request form

A lightweight form accessible from 3 places:
- **Homepage** — a prominent "Request a book" CTA
- **Browse page** — "Can't find your book? Request it"
- **Signup modal** — "Which books are you dying to read?" (during onboarding)

```
┌─────────────────────────────────────┐
│ What book do you wish you had       │
│ time to read?                       │
│                                     │
│ [Search or paste a URL...]          │
│                                     │
│ ┌─ Results ──────────────────────┐  │
│ │ Sapiens — Yuval Noah Harari   │  │  ← from catalog
│ │ Atomic Habits — James Clear   │  │  ← from catalog
│ │ + Add "The Mom Test"          │  │  ← not in catalog
│ └────────────────────────────────┘  │
│                                     │
│ Why? (optional)                     │
│ ○ Career growth  ○ Curiosity       │
│ ○ Someone recommended it            │
│ ○ Book club  ○ Exam/coursework     │
│                                     │
│ [Request this book →]               │
└─────────────────────────────────────┘
```

### Key UX detail

The search checks the catalog first. If the book exists, it links the request to the existing book. If not, the user can type any title or paste an Amazon/Goodreads URL — we store it as a wishlist entry and optionally trigger the Apify scraper to enrich it later.

---

## Public-Facing: "Most Wanted" Page

A public page at `/wanted` showing aggregate demand:

```
MOST WANTED BOOKS ON VYAZ

1. The Mom Test — Rob Fitzpatrick        47 requests  [Become narrator →]
2. Build — Tony Fadell                   38 requests  [Become narrator →]
3. Poor Charlie's Almanack               31 requests  [Become narrator →]
4. The Courage to Be Disliked            28 requests  [Become narrator →]
5. Outliers — Malcolm Gladwell           24 requests  [Become narrator →]
```

### Double duty

- **Consumers** see they're not alone — social proof that others want this book too
- **Narrators** see where the demand is — "47 people want The Mom Test narrated, I've read it, let me sign up"

It's a self-solving demand board. Demand attracts supply.

---

## Homepage: Request Leaderboard

A live leaderboard on the homepage showing the most requested books, sorted by request count. Visible to everyone — logged in or not. Drives both demand registration and narrator recruitment.

### Design

```
┌─────────────────────────────────────────────────────┐
│  MOST WANTED                                        │
│  Books people are dying to discuss                  │
│                                                     │
│  1. The Mom Test — Rob Fitzpatrick                  │
│     47 people want this  [I want this too →]        │
│                                                     │
│  2. Build — Tony Fadell                             │
│     38 people want this  [I want this too →]        │
│                                                     │
│  3. Poor Charlie's Almanack — Charlie Munger        │
│     31 people want this  [I want this too →]        │
│                                                     │
│  4. The Courage to Be Disliked — Ichiro Kishimi     │
│     28 people want this  [I want this too →]        │
│                                                     │
│  5. Outliers — Malcolm Gladwell                     │
│     24 people want this  [I want this too →]        │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Don't see your book?                               │
│  [Request a book — tell us what you want →]         │
└─────────────────────────────────────────────────────┘
```

### Behavior

- **Sorted by request count** — most wanted at the top, updates in real-time as new requests come in
- **"I want this too" button** — logged-in users can +1 a book. One request per user per book (deduplicated). If not logged in, opens signup modal first.
- **"Request a book" CTA at the bottom** — opens the request form for books not in the list (free text + optional URL)
- **Placement on homepage** — between "Why Vyaz?" and "Meet a narrator" sections
- **Shows top 5-10** — with a "View all →" link to the full `/wanted` page

### Data flow

```
User clicks "I want this too"
    ↓
Insert into book_requests (user_id, book_title, book_author)
    ↓
Leaderboard re-aggregates (GROUP BY book_title, COUNT)
    ↓
Count updates on screen
```

### For narrators

Each leaderboard entry also shows a subtle "Can you narrate this? →" link that takes narrators to the signup flow with that book pre-selected. This turns the demand board into a narrator recruitment tool.

### Implementation details

- **Component:** `RequestLeaderboard.jsx` — fetches all `book_requests`, groups by `book_title` or `book_id`, sorts by count, renders top N
- **Hook:** `useBookRequests.js` — fetches requests, aggregates leaderboard, provides `addRequest()` and `hasUserRequested()` methods
- **Deduplication:** Check if user already requested this book before allowing +1 (query `book_requests` where `user_id` + `book_title` match)
- **Logged-out users:** Show the leaderboard (read-only). "I want this too" opens signup modal. After signup, the request is submitted automatically (save intent in localStorage, similar to signup modal pattern).

---

## Admin-Facing: Demand Dashboard

In the admin panel, a Demand Dashboard section:

- **Most requested books (not in catalog)** — these should be imported via Apify
- **Most requested books (in catalog but no narrator)** — these need narrator recruitment
- **Request velocity** — which books are trending this week vs last week
- **Requester profiles** — are these professionals, students, book club members? (from motivation field)
- **Unfulfilled requests** — requests older than 2 weeks with no narrator match

---

## The Notification Loop

When a request gets fulfilled:

```
User requests "The Mom Test"
        ↓
3 weeks later, a narrator signs up for it
        ↓
Email: "Good news! The Mom Test now has a narrator on Vyaz.
        Book your first session → [link]"
```

This closes the loop. The user who requested it becomes the first customer for that book.

### Notification triggers

| Event | Who gets notified | Message |
|---|---|---|
| Book imported to catalog | All requesters of that title | "This book is now on Vyaz" |
| Narrator signs up for a book | All requesters of that book | "A narrator is now available for [book]" |
| Request hits 10+ votes | Admin | "High demand: [book] has 10+ requests" |
| Request unfulfilled for 14+ days | Admin | "Stale request: [book] needs a narrator" |

---

## Data Model

```sql
CREATE TABLE book_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  -- if book exists in catalog
  book_id UUID REFERENCES books(id),
  -- if book doesn't exist yet
  book_title TEXT,
  book_author TEXT,
  book_url TEXT,
  -- context
  motivation TEXT,
  -- status: pending → fulfilled (narrator available) → booked (user booked a session)
  status TEXT DEFAULT 'pending',
  notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_book_requests_title ON book_requests(book_title);
CREATE INDEX idx_book_requests_book ON book_requests(book_id);
CREATE INDEX idx_book_requests_user ON book_requests(user_id);
CREATE INDEX idx_book_requests_status ON book_requests(status);

-- RLS
ALTER TABLE book_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public book_requests read" ON book_requests FOR SELECT USING (true);
CREATE POLICY "Users create requests" ON book_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### Key design decisions

- `book_id` is nullable — if the book is in the catalog, it's linked. If not, `book_title` + `book_url` capture what the user wants.
- When the book is later imported via Apify, backfill `book_id` for all matching requests and trigger notifications.
- `motivation` is a free text field storing the dropdown selection (career, curiosity, recommendation, book club, exam).
- `status` transitions: `pending` → `fulfilled` (narrator available) → `booked` (user booked a session).
- `notified` flag prevents duplicate notification emails.

---

## Scaling Strategy

| Stage | How it works |
|---|---|
| **0-100 users** | Manual — founder reads the requests, imports books, recruits narrators for the top ones |
| **100-1,000 users** | Semi-automated — admin panel shows demand dashboard, founder prioritizes weekly |
| **1,000-10,000 users** | Automated — when a book hits 10+ requests, auto-scrape it via Apify, notify narrators who've read similar genre books |
| **10,000+ users** | Self-serve — narrators browse the "Most Wanted" board and sign up for books with demand. The marketplace matches itself. |

---

## Implementation Plan

### Step 1: Database migration
- Create `book_requests` table with indexes and RLS policies
- **Effort:** 15 min

### Step 2: Request form component
- Search input that queries the `books` table
- If no match, allow free text entry + optional URL paste
- Motivation dropdown (career, curiosity, recommendation, book club, exam)
- Submit creates a `book_requests` row
- **Effort:** 2 hrs

### Step 3: Homepage request leaderboard
- `useBookRequests` hook — fetches all requests, aggregates by book title/id, sorts by count, provides `addRequest()` and `hasUserRequested()`
- `RequestLeaderboard` component — renders top 5-10 books with request counts
- "I want this too" button — deduplicated per user per book, opens signup modal if not logged in
- "Request a book" CTA at the bottom for books not in the list
- Logged-out users: leaderboard is visible (read-only), "I want this too" triggers signup modal, intent saved in localStorage
- "Can you narrate this?" subtle link per entry for narrator recruitment
- Placement: homepage between "Why Vyaz?" and "Meet a narrator" sections
- **Effort:** 2 hrs

### Step 4: Place the request form across the app
- Browse page: "Can't find your book?" prompt when search returns no results
- Book not found state: when a user lands on a book page that doesn't exist
- Signup modal: optional "Which books are you dying to read?" step
- **Effort:** 1 hr

### Step 5: Most Wanted full page (`/wanted`)
- Full page version of the leaderboard — all requested books, not just top 10
- Count of unique requesters per book
- "Become narrator" CTA per book (links to signup modal with narrator toggle pre-selected)
- Sort by request count (descending)
- Filter by motivation (career, curiosity, etc.)
- **Effort:** 2 hrs

### Step 6: Admin demand dashboard
- Table of all requests with search/filter
- Aggregated view: top requested books not in catalog
- Aggregated view: top requested books with no narrator
- Request velocity chart (requests per week)
- Action: import book from URL directly from the dashboard
- Action: mark request as fulfilled
- **Effort:** 3 hrs

### Step 7: Notification system
- When a narrator signs up for a book, query `book_requests` for matching `book_id`
- Send email to all requesters with `notified = false`
- Set `notified = true` after sending
- Requires: transactional email service (Resend/Postmark) + Supabase Edge Function
- **Effort:** 3 hrs

### Step 8: Auto-import pipeline (later)
- When a book_request with a URL hits 10+ requests, auto-trigger Apify scraper
- Import the book to catalog
- Backfill `book_id` on all matching requests
- Notify requesters
- **Effort:** 2 hrs

---

## Total Effort

| Phase | Items | Effort |
|---|---|---|
| **Build now** | Steps 1-5 (migration, form, homepage leaderboard, placements, Most Wanted page) | ~7 hrs |
| **Build next** | Step 6 (admin dashboard) | ~3 hrs |
| **Build later** | Steps 7-8 (notifications, auto-import) | ~5 hrs |
| **Total** | | **~15 hrs** |

---

## Success Metrics

- **Requests per week** — are users actively telling us what they want?
- **Request-to-fulfillment time** — how fast do we get a narrator for a requested book?
- **Fulfillment-to-booking rate** — when we notify a requester, do they actually book?
- **Catalog growth driven by requests** — % of new books added because of user demand vs. manual curation
- **Most Wanted page conversion** — do narrators sign up for books from the board?
