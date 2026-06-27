# Tome — Project Status

*Last updated: June 27, 2026*

---

## What is Tome?

A peer-to-peer knowledge-transfer marketplace for books. Connects people who want to understand a book (listeners) with people who've read it deeply (narrators). Think "Cambly for books" — instant access to a person who has the book in their head.

**Repo**: https://github.com/Hridyanshu7/ultimate-publisher.git

---

## What's Built

### Tech Stack
- React 18 + Vite + Tailwind CSS (black/white/red theme)
- Supabase (Auth, PostgreSQL, Realtime)
- Zustand (state management)
- Apify (Amazon + Goodreads scrapers for book import)

### Pages & Features

| Page | Route | Status | Notes |
|------|-------|--------|-------|
| Home | `/` | ✅ Done | Hero + book grid with search/filter |
| Browse Books | `/books` | ✅ Done | Full catalog, genre chips, search |
| Book Detail | `/books/:id` | ✅ Done | Side-by-side Amazon + Goodreads data, narrator list |
| Add Book | `/add-book` | ✅ Done | Paste Amazon/Goodreads URL → auto-import via Apify |
| Login | `/login` | ✅ Done | Email magic link + Phone OTP + Google OAuth |
| Onboarding | `/onboarding` | ✅ Done | 5-step: name → role → genres → GCal/Calendly → complete |
| Dashboard | `/dashboard` | ✅ Done | Schedule/Listener/Narrator tabs, real Supabase data |
| Profile | `/profile` | ✅ Done | Edit name, email, role, genres, GCal, Calendly |
| Schedule | `/book/:bookId/narrator/:narratorId/schedule` | ✅ Done | Week-view slot picker, booking creates Supabase record |
| Narrator Profile | `/narrators/:id` | ✅ Done | Bio, books, reviews, availability |
| Post-Session Review | `/dashboard/review/:bookingId` | ✅ Done | Star rating + comment form |

### Data
- 20 enriched books with real Amazon + Goodreads data (covers, ratings, reviews, AI summaries)
- Stored locally in `src/data/books-enriched.json` + seeded in Supabase
- Book import via Apify: `junglee/amazon-crawler` + `khadinakbar/goodreads-all-in-one-scraper`

### Database (Supabase)
- 6 tables: profiles, books, narrator_books, availability, bookings, reviews
- RLS policies for all tables
- Migrations: `001_initial_schema.sql`, `002_user_updates.sql`
- Seed: `seed.sql` (20 books)

### Auth
- Email magic link (Supabase OTP) — working
- Phone OTP — requires Twilio setup or test phone in Supabase
- Google OAuth — requires Supabase provider config (in progress)

### Integrations
- Google Calendar OAuth — consent flow built, redirect handling done
- Calendly — narrator pastes link during onboarding
- Apify — Amazon crawler + Goodreads scraper for book import

---

## What's Remaining (MVP Gaps)

### Must-Have for Launch

| Item | Effort | Description |
|------|--------|-------------|
| Google OAuth login | 10 min | Configure client secret in Supabase dashboard + add callback redirect URI |
| Phone OTP | 15 min | Set up Twilio in Supabase OR add test phone numbers for dev |
| GCal token exchange | 2-3 hrs | Current flow gets auth code but doesn't exchange for access/refresh token (needs backend/edge function) |
| Narrator availability management | 3-4 hrs | UI for narrators to set weekly recurring availability slots (currently mock data) |
| Real-time narrator presence | 2-3 hrs | Supabase Realtime Presence for online/offline status (currently mock) |
| Booking notifications | 2-3 hrs | Email/push notification when a session is booked or upcoming |
| Mobile responsive polish | 2-3 hrs | Test all flows at 375px, fix layout issues |
| Loading states & error boundaries | 1-2 hrs | Skeleton loaders, empty states, error fallbacks |

### Nice-to-Have (Post-MVP)

| Item | Description |
|------|-------------|
| In-app video calling | Embed Daily.co/LiveKit instead of external Meet links |
| Narrator verification | Comprehension quiz to verify narrator actually read the book |
| Payment/subscription | Stripe integration for listener subscriptions, narrator payouts |
| Search improvements | Full-text search, fuzzy matching, recommendation engine |
| Narrator ratings algorithm | Weighted scoring based on reviews, response rate, session count |
| Book data refresh pipeline | Scheduled Apify runs to keep ratings/prices current |
| PWA / mobile app | Installable progressive web app or React Native wrapper |
| Admin dashboard | Manage books, narrators, reports, content moderation |

---

## What's Next (Recommended Order)

### Week 1: Complete the MVP loop
1. **Finish Google OAuth** — add client secret to Supabase, add callback URI
2. **GCal token exchange** — Supabase Edge Function to exchange auth code for tokens, store refresh token
3. **Narrator availability UI** — let narrators set their weekly slots instead of mock data
4. **Test end-to-end**: signup → onboarding → browse → book → schedule → dashboard → review

### Week 2: Polish and soft launch
5. **Mobile responsive pass** — test every page at 375px
6. **Loading/error states** — add throughout the app
7. **Realtime presence** — narrator online/offline via Supabase Realtime
8. **Deploy to Vercel** — production deployment with custom domain
9. **Soft launch** — share with 5-10 test users, founder acts as narrator on 5-10 books

### Week 3+: Iterate based on feedback
10. **Payment integration** if demand validated
11. **Narrator verification** system
12. **Booking notifications** (email)
13. **Expand book catalog** via import pipeline

---

## Key Files

```
src/
├── data/books-enriched.json    — 20 books with Amazon + Goodreads data
├── lib/
│   ├── supabase.js             — Supabase client
│   ├── calendar.js             — Google Calendar OAuth + event creation
│   └── bookImport.js           — Apify book import (Amazon + Goodreads)
├── stores/authStore.js         — Auth state (phone OTP, magic link, Google)
├── hooks/useBookings.js        — Real Supabase booking queries
├── pages/                      — All 11 pages
└── components/                 — UI primitives, layout, books, narrators

supabase/
├── migrations/
│   ├── 001_initial_schema.sql  — Tables, enums, RLS, indexes
│   └── 002_user_updates.sql    — Phone, email, calendly, gcal columns
└── seed.sql                    — 20 enriched books INSERT

.env                            — Supabase + Apify + Google credentials (gitignored)
```

---

## Strategy Docs
- [cambly-p2p-business-deep-dive.md](cambly-p2p-business-deep-dive.md) — Cambly business model analysis
- [books-p2p-seed-to-tree-journey.md](books-p2p-seed-to-tree-journey.md) — Seed-to-tree growth roadmap for Tome

---

## Cost Tracking

| Service | Cost | Notes |
|---------|------|-------|
| Supabase | Free tier | Auth, DB, Realtime |
| Apify (Amazon) | ~$0.06 | 20 books × $0.003 |
| Apify (Goodreads) | ~$0.10 | 20 books × $0.005 |
| Google Calendar API | Free | 1M events/day free tier |
| Vercel (deploy) | Free tier | Hobby plan |
| **Total so far** | **~$0.16** | |
