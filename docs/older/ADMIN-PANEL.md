# Vyaz — Admin Panel Specification

*Last updated: June 28, 2026*

---

## Overview

The admin panel is a protected section of Vyaz (`/admin`) accessible only to users with the `admin` role. It provides the founder/operators with full control over the platform: user management, book catalog, sessions, quality control, and analytics.

**Access:** Gated by `profiles.role = 'admin'` (new role to be added to the `user_role` enum). Admin link visible only to admin users in the header nav.

---

## Sections

### 1. Dashboard — Daily Metrics at a Glance

| Metric | Source |
|---|---|
| Total users | `profiles` count |
| New signups (today / this week) | `profiles.created_at` |
| Active narrators | `narrator_books` distinct narrator count |
| Total books in catalog | `books` count |
| Sessions today | `sessions` where `scheduled_at` is today |
| Sessions this week | `sessions` where `scheduled_at` is this week |
| Pending session requests | `session_requests` where `status = 'pending'` |
| Average session rating | `reviews` average of `rating` |
| Total completed sessions | `sessions` where status is completed or time has passed |

**Layout:** Card grid at the top, recent activity feed below (latest signups, latest sessions, latest reviews).

---

### 2. Users — View, Search, Manage Roles

**List view:**
- Table: Name, Email, Phone, Role, GCal connected, Onboarding complete, Signup date
- Search by name or email
- Filter by role (reader / narrator / both / admin)
- Sort by signup date, session count

**Actions per user:**
- View full profile (name, email, phone, avatar, bio, genres link, gcal status)
- Change role (reader → narrator → both → admin)
- View their sessions (as narrator and as listener)
- View their reviews (given and received)
- Suspend account (set a `suspended` flag, blocks login)
- Delete account

**Bulk actions:**
- Export user list as CSV
- Bulk role change (e.g., promote 5 users to narrator)

---

### 3. Narrators — Approve, Verify, Feature

**List view:**
- Table: Name, Avatar, Books count, Sessions hosted, Average rating, Review count, Verified status, Featured status
- Search by name
- Filter by: verified / unverified, featured / not featured
- Sort by rating, session count

**Actions per narrator:**
- View their book list (which books they can narrate)
- View session history + reviews
- Toggle verified status (per book or globally)
- Toggle featured status (featured narrators appear on homepage)
- Remove narrator from a specific book
- Add narrator to a book manually

**Narrator applications (future):**
- Queue of users who selected "I want to narrate" during signup
- Approve / reject with reason
- Send them to verification quiz

---

### 4. Books — Catalog Management

**List view:**
- Table: Cover thumbnail, Title, Author, Genre, Narrator count, Page count, Goodreads rating, Amazon rating
- Search by title or author
- Filter by genre
- Sort by rating, narrator count, date added

**Actions per book:**
- Edit: title, author, description, genre, cover URL, page count, ISBN
- View/edit Amazon data (JSONB) and Goodreads data (JSONB)
- View linked narrators
- View sessions for this book
- View session requests for this book
- Delete book (with confirmation — cascades to narrator_books, sessions)

**Add book:**
- Import via URL (existing Apify flow — paste Amazon/Goodreads link)
- Manual entry form (title, author, description, genre, cover URL, page count)

**Bulk import:**
- Paste multiple URLs (one per line)
- Queue for sequential Apify scraping
- Show progress (fetching... done / failed per URL)

**Categories & Collections:**
- Manage genre tags (rename, merge, delete)
- Create curated collections: "Staff Picks", "Most Narrated", "New Arrivals", "Trending This Week"
- Feature a collection on the homepage

---

### 5. Sessions — View, Manage, Intervene

**List view:**
- Table: Book title, Narrator, Type (1:1/group), Status, Scheduled at, Duration, Attendee count, Meeting link
- Search by book title or narrator name
- Filter by: status (scheduled/open/full/completed/cancelled), type (1:1/group)
- Sort by date, attendee count

**Actions per session:**
- View full details: narrator, attendees (with attendance status), meeting link, GCal event ID
- Change status manually (e.g., mark as completed, cancel)
- Remove an attendee
- Add an attendee manually
- Delete session

**Session Requests:**
- Table: Reader name, Book title, Preferred type, Status, Date requested
- Filter by status (pending/matched/expired)
- Action: Match to a narrator → creates a session, notifies both parties
- Action: Mark as expired
- Bulk: Notify all narrators linked to the requested book

---

### 6. Reviews — Moderate, Flag, Remove

**List view:**
- Table: Reviewer name, Narrator name, Book title, Rating (stars), Comment preview, Date
- Search by reviewer or narrator name
- Filter by: rating (1-5), flagged / not flagged
- Sort by date, rating

**Actions per review:**
- View full comment
- Flag as inappropriate (adds a flag, doesn't delete)
- Remove review (soft delete — hidden from public, kept in DB)
- Restore removed review

**Moderation queue (future):**
- Auto-flag reviews with profanity or suspicious patterns
- Queue of flagged reviews for manual review

---

### 7. Analytics — Growth & Health

**Growth metrics:**
- Signups over time (daily/weekly/monthly chart)
- Sessions over time (daily/weekly/monthly chart)
- Retention: % of consumers who book a 2nd session
- Conversion: visitors → signup → first session → repeat session

**Supply health:**
- Narrator coverage: how many of the top 50 books have 2+ narrators
- Availability hours: total narrator hours available this week
- Response rate: % of session requests that get matched within 48 hours
- Narrator churn: narrators who haven't hosted a session in 30+ days

**Demand signals:**
- Most requested books (from `session_requests`, grouped by book)
- Books with high demand but no narrators (requests but no narrator_books entries)
- Peak session times (which hours/days have most bookings)

**Revenue (future):**
- Total revenue, platform commission earned
- Revenue per session, per narrator
- Payout pending for narrators

---

### 8. Platform Settings

**Featured content:**
- Select which books appear in "Top rated books" on homepage
- Select which narrator appears in "Meet a narrator" spotlight
- Set homepage tagline/subtitle text

**Roles & permissions:**
- `reader` — can browse, book sessions, leave reviews
- `narrator` — reader + can host sessions, set availability
- `both` — reader + narrator
- `admin` — full access to admin panel, can manage everything

**Notifications (future):**
- Toggle notification types: booking confirmation, session reminder, review received
- Edit email templates
- Test send

**Pricing (future):**
- Set session price tiers (30 min / 45 min / 60 min)
- Set platform commission % (e.g., 20%)
- Set narrator minimum payout threshold
- Toggle free/paid mode globally

---

## Database Changes Required

```sql
-- Add admin to the role enum
ALTER TYPE user_role ADD VALUE 'admin';

-- Add suspended flag to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT FALSE;

-- Add featured flags
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS featured_narrator BOOLEAN DEFAULT FALSE;
ALTER TABLE books ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;

-- Add soft delete to reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;
```

---

## Tech Approach

- **Route:** `/admin` with sub-routes (`/admin/users`, `/admin/books`, `/admin/sessions`, etc.)
- **Auth gate:** Check `profile.role === 'admin'` — redirect non-admins to home
- **Data:** All reads/writes via Supabase — same API, admin just sees more
- **RLS:** Admin policies bypass row-level restrictions using `auth.jwt() ->> 'role' = 'admin'` or service role key via Edge Functions
- **UI:** Same design system (black/white/red), table-heavy layout with search/filter bars

---

## MVP Scope (Build First)

| Priority | Section | Effort |
|---|---|---|
| 1 | Dashboard (metrics cards) | 2 hrs |
| 2 | Users (list, search, role change) | 3 hrs |
| 3 | Books (list, edit, add, delete) | 3 hrs |
| 4 | Sessions (list, status management) | 2 hrs |
| 5 | Reviews (list, moderate) | 1 hr |
| — | **Total MVP** | **~11 hrs** |

### Post-MVP

| Section | Effort |
|---|---|
| Narrator management (verify, feature) | 3 hrs |
| Analytics charts | 4 hrs |
| Bulk import | 2 hrs |
| Platform settings | 2 hrs |
| Moderation queue | 2 hrs |
