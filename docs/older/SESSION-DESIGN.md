# Vyaz — Session Design & Engagement Specification

*Last updated: June 28, 2026*

---

## Why Sessions Go Stale

- Narrator just **recites** — it becomes a monologue, not a conversation
- No **structure** — rambling with no arc, no climax, no ending
- Listener is **passive** — they sit and absorb, no skin in the game
- Same **format** every time — predictable, no surprise
- No **takeaway** — listener leaves without something they can articulate

---

## Two Session Types

### 1. Overall Session — "Give me the whole book"

The listener wants the bird's eye view. The risk is it becomes a summary. The fix: **narrator curates the best parts, not all parts.**

**Suggested structure (30 min):**

```
0-5 min   WHY THIS BOOK MATTERS
          Narrator opens with their hot take — the most
          surprising or counterintuitive idea in the book.
          Not "this book is about habits" but "this book
          argues you should forget goals entirely."

5-15 min  THE 3 IDEAS THAT CHANGED HOW I THINK
          Not a chapter-by-chapter walkthrough. Narrator
          picks the 3 most impactful ideas and explains
          them with examples. Curated, not comprehensive.

15-25 min YOUR TURN — ASK ME ANYTHING
          Listener drives. "How does this apply to my
          startup?" "Is the author biased?" "What does
          chapter 7 actually say?" This is what makes
          Vyaz different from Blinkist.

25-30 min YOUR #1 TAKEAWAY
          Listener articulates their top insight in 2
          sentences. Narrator refines it. Listener leaves
          with something they can tell someone at dinner.
```

### 2. Chapter-wise Session — "Go deep on one section"

The listener wants depth on a specific chapter. Good for complex books where each chapter is a standalone idea (Thinking Fast and Slow, Sapiens). Also enables a **multi-session journey** — book all chapters as a series.

**Suggested structure (30 min):**

```
0-3 min   WHERE THIS CHAPTER FITS
          Context in the book's arc. "You can skip
          chapters 1-3 if you get this one concept."

3-12 min  THE CORE ARGUMENT
          Narrator explains the chapter's thesis with
          one real-world example the listener relates to.

12-20 min THE SCENARIO
          "What would you do?" — narrator presents a
          situation from the chapter, listener reacts,
          then narrator reveals the author's argument.
          This is the engagement engine.

20-27 min YOUR QUESTIONS
          Deep dive into specifics. This is where the
          conversation gets genuinely unique — no two
          sessions are the same.

27-30 min BRIDGE TO NEXT
          "Here's what the next chapter builds on this."
          Creates a natural reason to book the next
          chapter session.
```

---

## What Makes It Non-Stale by Design

### 1. Narrator styles — let listeners choose the vibe

Tag narrators by how they narrate:

| Style | Description | Best for |
|---|---|---|
| **Storyteller** | Narrates through anecdotes and analogies | Fiction, memoirs, history |
| **Analyst** | Breaks down arguments logically, structured | Business, science, philosophy |
| **Debater** | Opens with a hot take, invites pushback | Opinionated books, politics |
| **Coach** | Connects everything to the listener's life | Self-help, productivity |
| **Academic** | Deep, cited, thorough — like a lecture | Complex nonfiction, research |

Listeners pick the style they want, not just the narrator. Same book, completely different experience depending on style.

### 2. The "What Would You Do?" mechanic

Built into every session template. Narrator presents a scenario from the book, asks the listener to react BEFORE revealing the author's answer. This single mechanic turns a passive listener into an active participant. It's the difference between watching a movie and playing a game.

### 3. Post-session takeaway card

After every session, the listener gets a card (in-app or emailed):

```
┌─────────────────────────────────┐
│ SAPIENS — Overall Session       │
│ with Hridyanshu · June 28       │
│                                 │
│ Your #1 takeaway:               │
│ "The agricultural revolution    │
│  was history's biggest fraud —  │
│  it made life worse for most    │
│  humans, not better."           │
│                                 │
│ 3 ideas discussed:              │
│ · Cognitive revolution          │
│ · Agricultural trap             │
│ · Imagined orders               │
│                                 │
│ [Book next chapter →]           │
└─────────────────────────────────┘
```

This gives the listener something **tangible** to keep. It also drives repeat bookings ("book next chapter").

### 4. Chapter progression — the Netflix effect

For chapter-wise sessions, show a **progress bar** on the book page:

```
Sapiens — 3/12 chapters completed
████░░░░░░░░ 25%
Ch 1 ✓  Ch 2 ✓  Ch 3 ✓  Ch 4 [Book now]  Ch 5-12 🔒
```

This creates a completion urge — "I've done 3 chapters, might as well finish." Same psychology that makes Netflix binges happen. The next chapter is always one click away.

### 5. Listener prep — 2 questions before the session

When a listener books a session, ask them 2 questions:

1. "Why are you interested in this book?" (dropdown: career, curiosity, book club, exam, someone recommended it)
2. "What do you hope to walk away with?" (free text, one sentence)

The narrator sees these BEFORE the session. Now they can tailor the narration — a startup founder gets a different Sapiens session than a history student. Every session feels personal.

---

## Data Model Changes

```sql
-- Add session format
ALTER TYPE session_type ADD VALUE 'chapter';

-- Add chapter info to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS chapter_number INTEGER;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS chapter_title TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_format TEXT DEFAULT 'overall';

-- Add narrator style to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS narrator_style TEXT;

-- Listener prep questions
ALTER TABLE session_attendees ADD COLUMN IF NOT EXISTS motivation TEXT;
ALTER TABLE session_attendees ADD COLUMN IF NOT EXISTS goal TEXT;

-- Post-session takeaway
ALTER TABLE session_attendees ADD COLUMN IF NOT EXISTS takeaway TEXT;
```

---

## What to Build Now vs Later

| Now | Later |
|---|---|
| Overall + chapter-wise session types | Narrator style tags |
| Session templates (shown to narrator as a guide) | Post-session takeaway cards |
| Chapter selection when booking | Chapter progression bar |
| Listener prep questions (2 fields on booking) | "What would you do?" in-app mechanic |
