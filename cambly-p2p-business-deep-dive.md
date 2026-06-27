# Cambly-Style P2P Business: Deep Dive & Origin Story

*A conversation log on building a peer-to-peer marketplace business modeled on Cambly.*

---

## Part 1: The Business Model Deep Dive

### Core mechanic: marketplace, not tutoring company

Cambly doesn't really sell "English lessons." It sells *instant access* to a person. The product is the absence of friction — no scheduling, no homework, no commitment beyond clicking a button and talking to whoever's online. Tutors log in and mark themselves available, get put into a queue, and learners choose who to talk to — there's no advance scheduling required. That on-demand queue is the actual moat, not the English content.

### Where the money comes from vs. where it goes

This is the most important number in the whole business: a basic plan of one 30-minute lesson per week runs about $52/month, working out to roughly $13 per 30-minute lesson — i.e. ~$26/hour from the learner. The tutor on the other end of that call is paid $0.17 per minute, or $10.20/hour. That ~60% gross spread between what the learner pays and what the tutor earns is the entire business. Everything else — Cambly Kids at a slightly higher payout, B2B/corporate contracts, regional pricing tiers — is the same spread applied to different segments.

Two details make that spread bigger than it looks on paper:

- **Unpaid idle time.** Tutors only get paid for minutes actually on a call, and they're only on a call roughly 50% of the time they're logged in. Tutor supply absorbs the demand-variability risk for free — Cambly doesn't pay for standby capacity, the tutors do.
- **Regional price discrimination.** Cambly prices lessons cheaper in price-sensitive markets like Brazil, Turkey, and India while holding premium pricing in Japan, the Middle East, and Europe — same tutor pool, same product, different willingness-to-pay.

### Why supply tolerates the low pay

There's no degree, no TEFL certificate, no teaching experience required to qualify as a Cambly tutor — just being a native English speaker. The application has no background check or live interview, just a short form and an intro video. Zero barrier to supply is the point — it's what keeps the queue always staffed. The low bar is precisely what keeps wages low (massive interchangeable supply, no licensing scarcity to defend pay). It's why a meaningful share of working tutors eventually taper off toward independent students at 2–4x the marketplace rate once they've built a track record that doesn't need the platform's distribution anymore.

### What you'd actually need to build this in another niche

The Cambly playbook generalizes to *any* "pay for instant access to a person's time" market — language practice, but also instant legal Q&A, on-demand fitness coaching, mock interviews, music practice partners, niche consulting. The components are the same regardless of vertical:

- **A real-time matching/queue engine** — the actual hard engineering problem, not the video call itself (Twilio/Agora/LiveKit solve video). Needs supply-aware routing: who's online, who's idle, who matches the learner's need.
- **Subscription billing with usage metering** — recurring revenue decoupled from exact usage is what makes the LTV math work; pure pay-per-minute has much worse retention.
- **A payout system tuned for thin margins** — weekly/biweekly payouts, low minimums, multiple withdrawal rails, because supply is gig-economy-sensitive to cash flow delays.
- **Trust & safety at the edge** — open-door supply with 1:1 video is a real liability surface; this quietly costs the most once past MVP.
- **A wedge niche, not a category.** Cambly's actual strategic decision was refusing to be "a tutoring marketplace" and instead owning one narrow use case — spontaneous conversation practice — before ever expanding into kids/business/courses.

### The model choice: subscription vs. commission vs. access

- **Subscription-for-access (Cambly)** — predictable revenue, rewards ongoing usage, optimizes for learner LTV.
- **Commission-per-booking (Preply-style)** — scales naturally with transaction volume, aligns platform revenue with tutor success.
- **Pay-to-contact (Superprof-style)** — simplifies monetization but puts pricing power back in the tutor's hands.

Cambly's choice is structurally low-pay and high-churn on the supply side — worth deciding deliberately rather than copying by default, especially if you want a supply pool that doesn't burn out and leave.

---

## Part 2: The Origin Story & Cold-Start Flywheel

### The spark wasn't English — it was immersion

Sameer Shariff and Kevin Law were colleagues at a small startup called blip.me (Sameer was employee #2, Kevin employee #1) before either had any thought of building Cambly. Sameer had a transformational trip to Argentina where his Spanish improved faster through immersion than it had in four-plus years of classroom study, and Kevin had a similar experience learning French in France. They realized that kind of immersive language gain wasn't blocked by geography anymore — it was blocked by technology — and that's what they set out to fix.

### The pivot: chase demand, not your own hobby

They didn't want a formal lesson with a professional teacher — they wanted what you get when you strike up a conversation with a stranger while traveling, and they tried to recreate that. But when they looked at where actual market demand sat, they realized the world overwhelmingly wants to learn English, not French or Spanish, so they refocused the whole idea around that. The founders' personal itch pointed one direction, but they let market size override their own preference before writing a line of supply-side code.

### The MVP: the founder *was* the product

This is the key cold-start move. The very first version of the app had one big red button in the middle labeled "Practice English" — and clicking it connected the user via video chat directly to Sameer himself. There was no tutor marketplace yet — no queue, no matching, no supply side at all, just one of the founders personally taking every call. That sidesteps the classic two-sided marketplace chicken-and-egg problem entirely: you don't need tutor liquidity to test whether *students* want the product if you're willing to be the tutor yourself for a while.

### The bootstrap year: build by talking, not by guessing

They bootstrapped for roughly the first year, funding the company out of their own pockets, splitting time between writing code and meeting potential customers directly — those constant conversations directly shaped what they built next. Only once that manual, high-touch loop had validated the concept did they shift to the supply side: they started recruiting teachers to take over the tutoring so they could focus on the rest of the business, deliberately building a community of tutors from year one specifically so coverage would be available around the clock.

### Why round-the-clock supply mattered more than volume of supply

The flywheel they were chasing wasn't "more tutors" in the abstract — it was *coverage*, because the entire value proposition is "press a button, talk to someone right now." A marketplace with 500 tutors that's empty at 2am Turkey time is a worse product than one with 50 tutors spread cleverly across time zones. English was the right wedge partly because a huge, geographically distributed pool of native speakers (US, UK, Canada, Australia) made true 24/7 queue coverage achievable in a way a thinner-supply language never would.

### YC as an accelerant, not the origin

Only after that first bootstrapped year did they go through Y Combinator, in 2015, for roughly three months, after which they raised a seed round. The capital didn't create the model — it scaled a model that already had proof. Post-seed, they grew the team and specifically hired country managers in markets like Korea and Turkey — once the core loop worked, growth became a market-by-market localization problem, not a single global campaign.

### The infrastructure decision that's easy to miss

Most startups focus on their home market before going international, but Cambly had to be ready to serve students anywhere in the world from day one, because supply (native English speakers) and demand (English learners) were never going to cluster in the same place. That global-first requirement shaped their early tech choices from the start.

### The reusable cold-start pattern

1. Find your own immersive itch first, then check if the *market's* itch points somewhere bigger — follow the market.
2. Build the most stripped-down single-button MVP imaginable, and have a founder personally fulfill the supply side for the first cohort of real users.
3. Talk to those first users obsessively — that's your product roadmap, not a survey you run once.
4. Once demand is validated, recruit supply for *coverage*, not volume — solve for "always someone available" before solving for "lots of options."
5. Only then bring in outside capital/accelerators to scale a loop that already works, rather than to discover whether it works.

---

*Compiled from a research conversation, June 2026.*
