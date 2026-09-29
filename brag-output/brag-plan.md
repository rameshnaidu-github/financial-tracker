# brag-plan: Financial Tracker

**What it is:** a private, local-first money tracker for Indian households: accounts and credit cards, weekly entry, budgets, loans with EMI tracking, investments and reports, all in rupees, all in a SQLite file on your own machine.

**Who it's for:** someone who wants to see where their salary went this month without handing their bank history to a cloud service.

**What sets it apart:** nothing leaves the machine. No sign-up, no sync, no subscription. The data is one local file you can back up yourself.

**Visual hook:** the real app in dark mode, a big ₹ figure, and the line that everything else follows from: your money stays on your machine.

**Tone:** `polished`. Calm and restrained, because it is a finance tool and trust is the point. Long holds, soft fades, one claim per scene, no exclamation marks.

**Visual identity (taken from the app):** background `#0b0e14`, panel `#131823`, text `#e8ecf4`, muted `#98a2b4`, accent `#8fa3ea`, good `#4cc38a`, danger `#f0837b`. Geist Variable, tabular figures. Rounded 16px surfaces with hairline borders.

**Truth check:** every screen in the video is the running app against a seeded demo database. Every figure on screen is what the app computed from those transactions. No invented metrics, testimonials or user counts. The only text I wrote is the narration, and each line is a plain description of what the shot shows.

## Storyboard (20.0s at 30fps, 1920x1080)

| # | Time | Beat | What is on screen | Narration line |
|---|---|---|---|---|
| 1 | 0.0-2.8 | Hook | Dark field, ₹ mark draws in, wordmark under it | "Your money stays on your machine." |
| 2 | 2.8-6.4 | Reveal | Overview, camera settles on the headline row: Available cash ₹5,61,960 | "One page for everything you own and owe." |
| 3 | 6.4-9.8 | Highlight | Coming up in 7 days: AutoPay, Loans, Credit card payments, each with its own total | "It tells you what is due this week." |
| 4 | 9.8-13.2 | Highlight | Budget line card showing this month against last month's actual spend | "Plan this month against what last month really cost." |
| 5 | 13.2-16.6 | Highlight | Investments: current value by type, ring and legend | "See where the money actually sits." |
| 6 | 16.6-20.0 | Punchline | Wordmark, then the closing line and the stack | "No cloud. No sign-up. One SQLite file you own." |

Durations sum to 20.0s. Each narration line is 6-9 words and holds fully visible for at least 1.9s, which clears the 0.3s-per-word reading rule.

## Sound

One piece, written to the picture: a slow Dm7 pad (D2 root with A, C, F above), a soft three-note arpeggio that enters at the reveal, and a low pulse on each scene change. The scene-change pulses are the same notes as the pad, so the effects sit inside the music rather than on top of it. Everything is low-passed and kept around -18 LUFS with a hard ceiling below 0 dBFS, so it never spikes.
