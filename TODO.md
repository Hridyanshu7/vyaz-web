# Vyaz — Project To-Do List

*Last updated: June 30, 2026*

---

## Must-have for soft launch

- [ ] **Narrator availability UI** — Narrators need a way to set their weekly availability slots (day, time, timezone). The slot picker currently shows fake/mock times. This is the #1 blocker for real usage.
- [ ] **Mobile responsive pass** — Test every page at 375px (iPhone SE) and 390px (iPhone 14). Fix layout breaks, overflow, touch targets, and font sizes. No page has been tested on mobile yet.
- [ ] **Loading/error states** — Add skeleton loaders while Supabase fetches data. Show error messages when API calls fail. Add empty states for pages with no data (no books, no sessions, no narrators).

---

## Should-have before sharing with users

- [ ] **Narrator profile enrichment** — Add profession, one-liner bio, credentials, LinkedIn URL to narrator profiles. Capture post-onboarding (not during signup). Show on narrator cards so users can judge credibility.
- [ ] **Booking notifications** — Send email when someone books a session with a narrator. Send reminder email 1 hour before session. Use Supabase Edge Functions + a transactional email service (Resend/Postmark).
- [ ] **PROJECT-STATUS.md update** — Current doc is completely outdated (references Tome, local JSON, old architecture). Rewrite to reflect current state: Vyaz branding, Supabase-only data, sessions model, GCal integration, signup modal, Vercel deployment.

---

## Nice-to-have (post-launch)

- [ ] **Realtime narrator presence** — Show online/offline status for narrators via Supabase Realtime Presence. Green dot on narrator cards when they're active on the platform.
- [ ] **Payment integration** — Stripe (global) or Razorpay (India-first) for session payments. Listener pays per session or subscription. Narrator gets paid out minus platform cut. Needs Supabase Edge Function for checkout + webhooks.
- [ ] **Custom domain** — Point vyaz.ai to the Vercel deployment. Add domain in Vercel project settings + DNS configuration.
- [ ] **Narrator verification system** — Comprehension quiz per book to verify narrator actually read it. Prevents faking. Gate the "narrator for this book" status behind passing the quiz.
- [ ] **WhatsApp OTP via AISensy** — Replace Supabase SMS OTP with WhatsApp OTP delivery using AISensy (Meta WhatsApp Business API). Requires: AISensy account + WhatsApp Business Account + Meta-approved OTP template ("Your Vyaz verification code is {{1}}.") + Supabase Edge Function for custom OTP generation/verification. UI is already labeled as WhatsApp. Cost: ~₹350/month for 1,000 OTPs + AISensy platform fee. **Defer until post-PMF** — Google + LinkedIn OAuth covers auth for first 100 users at zero cost.

---

## Completed

- [x] React + Vite + Tailwind scaffold
- [x] Supabase schema (profiles, books, sessions, attendees, requests, reviews)
- [x] Google OAuth + Phone OTP + Email magic link auth
- [x] Signup modal (replaces separate login/onboarding pages)
- [x] GCal OAuth connect + token exchange via Edge Function
- [x] GCal event creation with Meet links + reminders
- [x] GCal freeBusy API for narrator availability
- [x] Book import via Apify (Amazon crawler + Goodreads scraper)
- [x] 20 enriched books with real covers, ratings, reviews, AI summaries
- [x] Sessions model (1:1 + group up to 50 attendees)
- [x] Session requests (listener demand signal)
- [x] Attendance tracking (Join button marks attended/missed)
- [x] Time-based session completion
- [x] Review system (star rating + comment, gated by attendance)
- [x] All data from Supabase (no local JSON dependency)
- [x] Homepage redesign (How it works, Why Vyaz, Featured books, Narrator spotlight)
- [x] BookDetail redesign (intent-driven, review testimonials, Goodreads genres)
- [x] Google profile sync (name, email, avatar auto-pulled)
- [x] Favicon + OG meta tags
- [x] Deployed to Vercel (vyaz.vercel.app)
- [x] Rebranded: BookLoop → Tome → Vyas → Vyaz
- [x] LinkedIn OAuth login (side-by-side with Google)
- [x] Contextual signup modal (5 trigger types with different post-auth redirects)
- [x] Booking flow redesign: BookingModal replaces Schedule page
- [x] Narrator selection step before slot picker
- [x] No-narrator fallback with Request a session CTA
- [x] Seat validation for group sessions
- [x] Upcoming group sessions on homepage
- [x] WhatsApp branding on phone auth (UI ready, backend pending)
- [x] Profile page: avatar display + editable WhatsApp number
