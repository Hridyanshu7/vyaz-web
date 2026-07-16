const PILLARS = [
  {
    title: 'Fidelity over slop',
    body: "We deliver the author's actual words, verbatim. The AI narrates — it never paraphrases, summarizes, or invents. Faithfulness is the product, not a setting.",
  },
  {
    title: 'Conversation is oldest',
    body: 'Knowledge moves the way we evolved to move it: spoken, in a dialogue you can interrupt and question. The epics were spoken long before they were ever written down.',
  },
  {
    title: 'Honor the author',
    body: 'The human who created the idea is named and credited. Vyaz elevates originators — it never launders them into anonymity.',
  },
  {
    title: 'Rooted, then modern',
    body: 'Indian intellectual heritage lives in the name and the mark. Everywhere else, the product aims to feel like the best modern software you already use every day.',
  },
]

export function Mission() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12 sm:py-16">
      <p className="text-[10px] font-mono uppercase tracking-wider text-highlight-hover mb-3">Our mission</p>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight max-w-2xl leading-tight">
        The book, talking back to you — not a slop-summary of it.
      </h1>
      <p className="text-ink-soft mt-4 text-base sm:text-lg max-w-2xl leading-relaxed">
        Vyaz exists to carry an author's original thinking to a reader — faithfully, and in the way
        humans have always passed knowledge on: in conversation.
      </p>

      <div className="max-w-2xl mt-8 space-y-4 text-sm text-ink-soft leading-relaxed">
        <p>
          Named for <strong className="text-foreground">Vyasa</strong> — the sage credited with speaking
          the Mahabharata and the Puranas into being — Vyaz treats the person who put pen to paper as the
          source of truth, and the voice as a faithful medium, never a substitute.
        </p>
        <p>
          In an era of AI-generated summaries that flatten every book into the same bullet points, Vyaz is
          built to be the opposite: the genuine, the sourced, the whole.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4 max-w-3xl mt-12">
        {PILLARS.map((p) => (
          <div key={p.title} className="p-5 rounded-xl border border-border bg-surface shadow-raised">
            <h3 className="font-semibold text-sm mb-1">{p.title}</h3>
            <p className="text-xs text-ink-soft leading-relaxed">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="max-w-2xl mt-10 p-5 rounded-xl bg-accent-wash">
        <p className="text-sm text-foreground leading-relaxed">
          If it ever feels like generated content instead of a real person's genuine work, faithfully
          carried — that's the one thing we're not willing to get wrong.
        </p>
      </div>
    </div>
  )
}
