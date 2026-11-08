# Implemented design

This document describes the existing fixed build restored from commit `3db1ea0dd69e988b50fff608001a5d95b9537041`. This repair changes no application or design source. Token and component values were checked against the restored source; production DOM interactions were checked with JSDOM. Browser rendering, first-screen placement and rendered contrast could not be reverified because Chromium could not start. See [VALIDATION.md](VALIDATION.md) for this repair's evidence and limits.

## Overview

Squeek Beat-the-AI Predictor is a small, friendly prediction arena for players who want to outguess a visible rival. Its visual idea is a warm arcade field notebook: original pixel hamsters, a physical-looking wheel, paper-coloured surfaces and a single burnt-orange action. The source orders the arena and prediction controls before explanatory sections. This is a game interface, not a marketing landing page or financial dashboard.

The source of truth is `src/style.css`, with game-specific vector characters in `src/Characters.tsx`, generative artwork in `src/art.ts`, and the view/component patterns in `src/App.tsx`. Values below describe the final implementation, including the mobile overrides at the end of the stylesheet.

## Colors

The CSS uses a compact semantic palette in hexadecimal notation. Reuse the roles rather than inventing another orange or muted text colour.

| Token | Value | Job |
| --- | --- | --- |
| `--bg` | `#f7f6f2` | Page background |
| `--surface` | `#fffefa` | Arena, controls, dialogs |
| `--ink` | `#302d29` | Primary text and selected mode |
| `--muted` | `#686258` | Secondary labels and help |
| `--line` | `#e4dfd5` | Structural separators and control outlines |
| `--accent` | `#b74425` | Links, selection outlines, signature heading |
| `--accent-solid` | `#be4729` | Main action fill |
| `--accent-hover` | `#a5381d` | Main action hover |
| `--accent-soft` | `#fae6db` | Sprint selection and practice notice |
| `--green` / `--green-soft` | `#39754e` / `#edf3e9` | Fresh LIVE state, saved/collected/unlocked states |
| `--night` / `--night-soft` | `#5c567c` / `#eeebf5` | Nap selections and Professor nap call |
| `--focus` | `#246d99` | Visible keyboard focus ring |

The scoreboard uses `#eeeae1` and its compact selector uses `#e2ddd3`; the activity surface is `#f0eee7`. The wheel scene uses `#f4eee5` with brown and tan vector geometry. Those illustrations are decorative; feed state is communicated through text as well as colour. Unknown scenes remove the hamster and show a question mark.

The activity strip uses `hsl(18 70% L%)`, with lightness from 89 down to 42 according to **relative active-round counts**. This is a categorical historical visual, not a probability signal or an action. Deterministic canvas art has its own settlement-driven colours; do not reuse its random hues as interface tokens.

Declared solid token pairs were recalculated using WCAG sRGB luminance; those source calculations are recorded in `artifacts/token-contrast.json`. Rendered backgrounds, opacity and artwork were not measured in this repair. The taste probe could not start Chromium, so no current rendered contrast pass is claimed. There is no dark theme.

## Typography

The entire interface uses locally bundled **Outfit**, falling back to Arial/sans-serif. `public/outfit-latin.woff2` is a variable normal face declared for weights 100–900; the interface uses only **400, 600 and 700**. `font-display: swap` and a local asset avoid a font-service dependency. The font’s SIL OFL is included alongside it.

Six semantic size roles in `src/style.css`:

| Token | Default | Usage |
| --- | ---: | --- |
| `--small` | 12px | Captions, timestamps, activity ticks, hints |
| `--label` | 14px | Controls, supporting copy, card titles |
| `--body` | 16px | Body text and small headings |
| `--subhead` | 20px | Section headings and metrics |
| `--heading` | 28px | Brand and dialog titles |
| `--display` | 44px | Main headline and score numbers |

At intermediate widths the headline is 36px. At 560px and below, `--display` becomes 32px while the main headline uses `--heading` (28px). Main headings use tight tracking only at display sizes; mobile heading tracking is `-.035em`. Most body lines use unitless 1.5 line-height, help/article copy 1.6–1.7, and short headings 1.15–1.35. Long explanatory copy is limited to about 65 characters per line.

Timers and readings use tabular numerals. Round IDs and large scores can wrap rather than disappear behind ellipsis. Inputs use 16px text to avoid iOS focus zoom. Use natural casing; required LIVE/OFFLINE/UNKNOWN and PRACTICE signals remain explicit exceptions to ordinary sentence case. There is no monospace prose or tracked uppercase kicker system.

## Layout

The `.wrap` primitive is at most 1200px, with 40px gutters per side by default. At 1080px it has 24px gutters; at 560px it has 16px. Above 1500px it can grow to 1260px with 60px outer gutters.

Spacing follows an 8px base rhythm with 4px refinements: 8–12px within control groups, 16–24px within surfaces, and 24–32px between sections. The arena and scoreboard align to shared edges. There is no fixed or sticky header, and no fixed action obscures the game.

- **Above 850px:** arena and 292px scoreboard occupy two columns. Inside the arena, the wheel and predictions are two balanced columns. The artwork gallery is four columns.
- **850px and below:** the score panel moves below the arena. Its contents form a compact two-column comparison. The gallery uses two columns.
- **560px and below:** the board becomes one column, with a compact 90px wheel scene above the controls. The 70px header, short intro and compact navigation keep the main prediction action on the first 390px-wide screen. “The arena / Collection / Achievements” become “Play / Art / Awards.” The mode switch remains beside them. The 24-hour strip becomes three rows of eight independently labelled targets. About content and achievement lists become single columns.
- **360px and below:** navigation icons are removed to preserve readable names, the scoreboard stacks its internal sections, and artwork details can wrap. Controls remain in document flow.

The source contains responsive rules for narrow phones, intermediate widths and desktop. Its browser suite includes 320px, 390px and 1440px checks, but that suite could not start Chromium in this repair. No new first-screen, overflow or font-loading observation is claimed. Dialog CSS limits width to `calc(100% - 24px)` on mobile and allows internal scrolling. Real-device Safari, native 200% zoom, RTL mirroring and OS text-resize modes remain unverified.

Feed errors stay inside `.prediction-column`, after the lock hint and form message. The arena and its disabled action remain above the error explanation on phones; the adjacent **Play practice** recovery also fits the first 390 × 844 screen. The unchanged diagnostic text and **Retry now** remain available below those controls.

The **Confirmed vs pending** ledger is an open section with a 30px top margin, no fill, no padding and no rounded outer frame. Its two labelled `.ledger-card` columns use `--surface`, a 1px `--line` border, 12px radius and 16px padding. The grid has a 16px gap and stacks at 720px. Confirmed and pending states remain separate without nesting two cards inside another card.

## Elevation & Depth

The arena uses one structural 1px border and an 18px radius; the score panel uses a contrasting paper fill without a border/shadow combination. The artwork grid is open, not a nested set of boxed cards. Shadows are reserved for the transient achievement toast. Native dialogs use a dark translucent backdrop with 3px blur and the browser’s top layer; they are not manually stacked popovers.

The warm wheel illustration has its own drawn ground shadow. That is artwork, not an interface elevation style. Keep normal content surfaces flat.

## Shapes

Outer arena/scoreboard radii are 18px on desktop and 14px on phones. Artwork and minor sections use 9–13px radii; buttons use 8px, small brackets 7px. Avatars and the reveal symbol are circular. Radio-like Nap/Sprint choices use rounded rectangles with visible icon, label, selected fill and check mark. Selection is not communicated through colour alone.

## Components

| Component or pattern | Source | Behaviour |
| --- | --- | --- |
| Main action `.primary-button` | `src/style.css`, `src/App.tsx` | One dominant filled action per game state: lock, reveal, or return; visible disabled explanation and a Practice alternative |
| Nap/Sprint `.call-options` | `src/App.tsx` | Native buttons with `aria-pressed`; chosen state includes a check; disabled after lock |
| Sprint brackets `.bracket-options` | `src/App.tsx` | Four labelled choices; disabled until Sprint; minimum comfortable separation |
| `WheelScene`, `PixelHamster` | `src/Characters.tsx` | Fresh ACTIVE movement follows RPM; fresh IDLE curls up with Zs; stale/offline has no sleeping hamster; pause stops scene motion |
| Score panel | `src/App.tsx` | Equal-width player/Professor columns; This week / All time switch; explicit local-score disclaimer |
| Professor explanation | `src/App.tsx` | Native `details/summary`; input counts, percentages, last known outcomes, fallback and formula |
| `ArtCanvas`, `ArtCard` | `src/ArtCanvas.tsx`, `src/App.tsx` | Accessible canvas name; inspect full artwork/seed; collect or download; empty state points back to play |
| Activity strip | `src/App.tsx` | Native per-hour buttons; selected-hour counts; resolution and relative-colour limits stated next to the strip |
| Achievement cards/toast | `src/App.tsx` | Nine local achievements; permanent unlocked state; polite announcement and manual dismiss |
| `ResultReveal` | `src/App.tsx` | Native labelled dialog; visible point breakdown, outcome and streak; Escape/backdrop/close paths; focus restoration |
| About | `src/App.tsx` | Short sections explaining play, limits, points and required community attribution; normal document navigation |
| Feed recovery | `src/App.tsx`, `.feed-notice` | Adjacent alert after prediction controls; automatic backoff, Retry now and first-screen Practice recovery |
| Boot/loading/error | `index.html`, `src/main.tsx` | Inline styles and static loading text precede the bundle; 20-second guard and render boundary show Try again; JavaScript-disabled visitors immediately see the explanation and reload link |

Buttons and links have explicit names; icon-only controls have `aria-label`. Every keyboard focus ring is 3px in `--focus`, with sufficient offset. Native buttons supply Enter/Space behaviour and native dialogs supply background inertness and focus containment. Focus returns to the trigger when it still exists, otherwise to the main landmark. A skip link is the first focusable item.

The live lock state waits for matching status, history and event installation IDs as well as freshness and closure guards. A feed transition keeps the action unavailable rather than presenting history from a different installation as the current game.

Professor inputs, live artwork, the confirmed ledger and scoring all use the existing `confirmedSettlements` frontier filter. A submitted round remains pending even if its covering event arrives ahead of the confirmed status anchor. This preserves the existing AI formula and point rules.

The static boot screen uses a system sans-serif stack, 28px heading and 16px body, with the established paper, ink and orange colors, so it remains legible before application CSS or fonts load. With JavaScript disabled, a `noscript` style hides `#root`; the explanation is the first viewport. Reduced motion sets `.boot-wheel` to `animation: none`, retaining the static wheel and loading text. A finite delayed hint reveals the reload link after 12 seconds.

The pending-call evidence backfill in `src/api.ts` and `src/useFeed.ts` now reaches saved live calls older than seven days. While a multi-poll scan is incomplete, the existing Professor loading state remains visible and the live action waits for history. A failed page uses the existing adjacent feed error; it never turns a pending call into a result. Confirmed recovered calls use the same result dialog, streak breakdown, scoreboard and art collection as current calls. The existing browser suite retains the eight-day-return and cursor-error checks; those browser checks could not run in this repair. The source tokens and layout are preserved verbatim.

Game animations exist only under `prefers-reduced-motion: no-preference`. The wheel rotates continuously from the reported RPM, with a minimum 0.2-second period to prevent extreme speed. Running bounce is 0.24s, sleep breathing is 3s, result reveal is 0.5s, and control colour transitions are 120ms. Reduced motion disables those loops; a visible pause control additionally pauses scene animation. There are no autoplay sounds, flashes, game page-load entrances or `transition: all` rules.

## Do’s and Don’ts

- Start new content with `.wrap`, `.section-heading` and existing text roles. Reuse the open art-grid treatment rather than adding nested surfaces.
- Keep the player’s call controls above secondary facts and galleries on phones. Preserve the short first-screen intro.
- Reuse the accent button for the next meaningful action. Keep equal peer choices outlined until selected.
- Keep data labels literal: hardware freshness controls LIVE, confirmed settlements control results, and Practice remains separate.
- Keep full hashes in the art detail view, with wrapping. Never clip a critical number to make a row fit.
- Use the existing native disclosure/dialog patterns and keyboard states for additional detail. Do not add another font, decorative gradient, ticker, price metric or wallet flow.

Design guidance is adapted from Jakub Krehel’s Better Interface (MIT) and documentation guidance from Paul Bakaus’s Impeccable (Apache-2.0), at the pinned revisions listed in README.md. Preserved licence texts are in `docs/design-guide-LICENSE.txt`. The visual character and game components above describe this project’s implemented source, not a claim of requester or Genesis design approval.
