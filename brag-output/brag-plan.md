# Where did it go? — launch film

**Angle.** Not a feature tour. A month in the life of one salary: it arrives, it
disappears, and the app is what tells you where it went. The question the film asks
in the first six seconds is the question the product answers.

**Hook (0–2s).** A number counts up to ₹1,52,000 on a black field. Nothing else.

**Punchline (18–22s).** The same month, resolved: +₹72,960 saved, 48% of what came
in — and it never left the machine.

**Tone.** Polished, close to deadpan. No jokes, no adjectives the numbers do not
earn. The energy is in the cut and the track, not in the copy.

## Shape

120 BPM, eleven bars of two seconds, so every cut lands on a downbeat and the film
is exactly 22s. Three acts:

| Act | Bars | What happens |
|---|---|---|
| The problem | 1–3 | A salary lands and leaves |
| The catch | 4–8 | The app has all of it, named |
| The resolution | 9–11 | The month closes, and it is private |

## Storyboard

| Bar | Scene | On screen | Line |
|---|---|---|---|
| 1 | `salary` | ₹1,52,000 counts up, left column | A salary lands. |
| 2 | `leaks` | The figure drains as real transactions tumble off to the right | Then it leaves. |
| 3 | `question` | The remainder blurs, the chips drift out of frame | Where did it go? |
| 4 | `catch` | The app's donut draws itself, arc by arc, to ₹79,040 | Every rupee lands somewhere. |
| 5 | `legend` | Six categories slide in beside the ring, with amounts | Named and counted. |
| 6 | `views` | The ring shrinks away; the same figures rebuild as bars | Ring, or bars. |
| 7 | `upcoming` | The real Coming up list: loans, AutoPay, cards, ₹71,655 due | It warns you what's due. |
| 8 | `budget` | Budget lines fill, each with last month marked on the same bar | Against last month. |
| 9 | `settle` | Cashflow panel: in, out, saved, rate — all counting up | Month end, nothing missing. |
| 10 | `saved` | The Saved cell is pulled out and magnified to +₹72,960 | Now you know. |
| 11 | `close` | Mark and wordmark, the film's only still moment | All on your machine. |

## Visual identity

Everything on screen is built from `src/styles.css` and `src/theme.css` in dark
theme — the donut, the `upcoming-row`s, the panels and the chips are the product's
own components at title-card size, not screenshots being panned over.

- Geist Variable, the app's typeface. Tabular figures throughout.
- Off-black `#0b0e14`, never pure black. One accent, the app's periwinkle `#8fa3ea`.
- Category colours come from the app's own palette, per category.
- Asymmetric: type in a lower-left column, data top-right. Nothing is centred.
- Only `transform`, `opacity`, `filter` and `color` move, so every frame composites.
- Spring settle on entrances, staggered so lists arrive one row at a time.

## Sound

One piece, D minor at 120 BPM, written in `work/make-audio2.mjs` and synthesised
sample by sample:

| Bars | Section | Parts |
|---|---|---|
| 1–2 | question | kick, bass, hat — sparse |
| 3 | riser | a sweep and a snare roll that halves its spacing |
| 4–8 | drop | four on the floor, claps, arpeggio, lead over Dm Bb F C Dm |
| 9 | break | pad and one bell, drums out |
| 10–11 | resolve | drums return, then one hit and a tail |

Everything ducks under the kick, so the track pumps. Peak −0.9 dBFS, mean −11.1 dB.

## Figures

Every number comes from the app running against the seeded demo database, recorded
with its source in `work/scene-data.json`. Nothing on screen is invented, and the
scene file cannot hard-code a figure — the audit checks for it.

## How it is built

```
node brag-output/work/make-scene-data.mjs     # bundle figures + beat sheet for the page
node brag-output/work/make-audio2.mjs         # write soundtrack.wav
node brag-output/work/render-frames.mjs       # 660 frames through Chrome CDP
node brag-output/work/make-film.mjs           # encode brag.mp4, brag.jpg, public/intro.mp4
```

`work/scene2.html` renders any moment of the film as a pure function of time
(`window.__render(t)`), which is what makes the render deterministic and the stills
worth reviewing.
