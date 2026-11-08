# Validation of the DNS continuation and missing-export repair

**Overall status: incomplete.** The missing production export is repaired and the existing game is preserved. DNS ownership verification is not complete: this session cannot write authoritative DNS, and neither public resolver returned the requested TXT value. Browser rendering also remains unverified in this runtime. Results below are this worker's observations, not independent certification.

## Scope and provenance

The task says, “Do not rebuild the game, do not change its code, design, or domain.” The repair therefore restores the existing fixed build rather than implementing a replacement or redesign. The initial checkout contained only a README and DNS artifacts; `dist/index.html` was absent.

The supplied fixed job, `b7fd99d8-31ac-4482-ad29-d3dfd6095e80`, exposes its [accepted result](https://api.imd.fun/jobs/b7fd99d8-31ac-4482-ad29-d3dfd6095e80/result). It points to [fixed source commit `3db1ea0dd69e988b50fff608001a5d95b9537041`](https://github.com/identity-md-launches/launch-3136-continue-existing-squeek-beat-the-ai/tree/3db1ea0dd69e988b50fff608001a5d95b9537041). That exact source, package manifest, lockfile, required schemas/validators, public assets, existing tests and export were recovered without application changes. The originally supplied launch-3134 repository was checked first; its export differed from the fixed live site, so it was not used to replace the game.

All **49 non-documentation/non-ignore files** match the fixed upstream hashes, including all application source, configuration, dependencies' manifest/lockfile, tests and export. All **10 export files**, including the dynamically imported App chunk, match live-site downloads byte for byte. Evidence: [restoration.json](artifacts/restoration.json), [export-integrity.json](artifacts/export-integrity.json).

The production build was run in a disposable copy at `test/scratch/fixed-upstream/` to satisfy the requested build check without replacing or republishing the restored game. The scratch build reproduced every restored export byte exactly, and regenerating the standalone validators did not change their bytes. No DNS record, domain mapping or hosted asset was mutated. No publishing command was run.

## Commands and results

| Check | Actual result | Evidence |
| --- | --- | --- |
| Dependency install in scratch: `npm ci` | Exit 0; lockfile unchanged | Installed only in scratch; no dependencies delivered |
| `npm run typecheck` in scratch | Exit 0; `tsc --noEmit`, no diagnostics | [typecheck.txt](artifacts/typecheck.txt) |
| `npm test` in scratch | Exit 0; **68 passed, 0 failed** | [unit-tests.txt](artifacts/unit-tests.txt) |
| `npm run build` in scratch | Exit 0; validators generated, Vite production build completed | [build.txt](artifacts/build.txt) |
| Scratch-build vs restored-export comparison | All 10 files identical | [export-integrity.json](artifacts/export-integrity.json) |
| Live download vs restored-export comparison | All 10 files identical | Same integrity report |
| HTML/CSS/module asset-reference inspection | All 12 identified local references exist and resolve relative to their correct document/module/stylesheet base | Same integrity report |
| Title, favicon, description, `og:title`, `og:image` | All present; referenced local favicon and share PNG retained | Same integrity report; `dist/index.html:7` |
| Production DOM interaction harness | Exit 0; **5 groups passed** against the actual emitted entry and dynamic modules | [production-dom-results.json](artifacts/production-dom-results.json), [text output](artifacts/production-dom-results.txt) |
| Supplied browser tool | Could not initialize Chromium; no page or screenshot obtained | [browser-checks.json](artifacts/browser-checks.json) |
| Existing `npm run test:browser` in scratch | Exit 1 at Chromium startup; no browser interaction check completed | Same browser report |
| `node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | Exit 2 at Chromium startup; **not measured**, no screenshots | Same browser report |
| `dig TXT _squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site` | Exit 9; no servers could be reached | [dig.txt](artifacts/dig.txt) |
| Google and Cloudflare HTTPS TXT lookups | Both NOERROR with only a CNAME; exact required TXT **not returned** | [dns-verification.json](artifacts/dns-verification.json) |
| Submission size, forbidden packaging and preserved source | Final measurement recorded in packaging report | [submission-size.json](artifacts/submission-size.json) |

Vite warns about the existing 1.28 MB standalone-schema chunk exceeding 500 kB; its gzip estimate is about 78 kB. This is the fixed build's required CSP-compatible validation code, retained unchanged. It is not a build failure and was not removed to reduce package size.

## Meaningful interaction evidence

The existing 68 unit tests cover the deterministic Professor, scoring/streak bonuses, settlement confirmation versus pending submissions, round timing, stale/offline/simulated data, schema/network rejection, old pending-call evidence, event pagination and resumption, duels, achievements, art seeds and distance-counter resets.

The scratch DOM harness imported **`dist/assets/index-BZxXIndT.js` and its real dynamic App/schema modules**, using JSDOM 26.1.0 and Testing Library DOM 10.4.0. It did not import a replacement App or mock game logic. Feed requests were explicitly rejected as an offline fixture; no simulated response was presented as live data.

The five passing groups establish:

1. The emitted production modules execute and mount the actual game controls.
2. With the offline fixture, Live is disabled; **Play practice** switches to Practice; locking without a choice shows **Choose Nap or Sprint first.** beside the controls.
3. Choosing Nap and locking disables choice edits. Revealing opens the result component, awards **15 points with streak 1**, persists one settled Practice entry and one Practice artwork, and creates no Live entry.
4. Closing the result and navigating to Collection exposes the collected artwork. Opening its detail exposes the download control; closing it and navigating to Awards exposes First Call.
5. No uncaught JSDOM script error occurred during those flows.

This is **DOM behavior**, not rendered-browser evidence. JSDOM's `noscript` block was removed in the harness before importing JavaScript because its outside-only parser otherwise applies the JavaScript-disabled root-hiding CSS. Dialog `showModal`/`close` methods were shimmed to toggle `open`, `scrollTo` was a no-op, and canvas `getContext` returned null. Thus native dialog focus/inertness, scrolling, painting, actual PNG downloads, CSS layout, font loading, animation, security policy and real-world live/duel outcomes are **not verified** by that check. Test dependencies and harness remain in disposable scratch, outside the runtime export.

## Better Interface coverage

The pinned workflow, all six domains' core principles, the documentation method, design-critic thresholds/probe and wallet references were read as task inputs. The source's existing warm paper palette, Outfit typography, pixel hamster arena and plain game labels remain authoritative. No wallet is needed or added to this browser points game. The visual idea remains a small hamster prediction arena carried by the pixel wheel and a visible AI rival.

| Domain | Checked without a browser / DOM evidence | Unperformed browser subchecks |
| --- | --- | --- |
| Accessibility | Native buttons and named groups (`src/App.tsx:721`), pressed/disabled states, adjacent status validation (`:858`), labelled native dialogs (`:1338`), focus CSS (`src/style.css:76`), reduced-motion guards (`:1527`, `index.html:52`). Practice and error controls exercised in DOM. | Visible focus, complete keyboard-only walk, native modal focus restoration/inertness, target overlap, screen-reader announcements, forced colors, automated browser accessibility audit |
| Layout | Product precedes secondary sections (`src/App.tsx:606`); feed errors follow the primary controls (`:863`); responsive rules at 1080/850/720/560/360 and above 1500 (`src/style.css:1574` onward); static asset subpath references checked | Actual 320/390/1440 reflow, first screen at 390, intermediate widths, overflow/clipping, native 200% zoom, RTL and pseudo-localization |
| Writing | Labels match their handlers: Lock practice call, Reveal practice round, Play practice, Retry now, Collection and Awards. Empty-choice message reproduced. Local-only points and Practice distinction preserved. DNS documents explicitly state incomplete status. | Text appearance and wrapping; no browser required for label/action source review |
| Typography | Outfit local WOFF2, weights 400/600/700, six semantic size tokens (`src/style.css:1`), unitless line heights, tabular numeric styling and mobile overrides retained | Actual font loading, glyph/weight appearance, measured wrapping and truncation |
| Colors | Existing semantic hex tokens (`src/style.css:9`) preserved; declared opaque pairs calculated using WCAG sRGB luminance | Rendered backgrounds, opacity/image pairs, focus contrast across all states and actual rendered text contrast |
| UI | Primary-action, selected, disabled, pending, error, Practice, result, collection and award source patterns retained. DOM exercised error, choice, lock, result and navigation. Motion remains under reduced-motion guards. | Rendered hover/focus/press/loading states, wheel/canvas painting, reduced-motion behavior, slow animation-panel replay, Safari and physical devices |

Declared-pair calculations (not rendered measurements): primary ink `#302d29` on page `#f7f6f2`: **12.667:1**; muted `#686258` on page: **5.586:1**; muted on surface `#fffefa`: **5.985:1**; surface-colored action text on `#be4729`: **5.047:1**; focus `#246d99` against surface: **5.590:1**. See [token-contrast.json](artifacts/token-contrast.json) for method and limitations.

The supplied browser tool failed during initialization. A scratch-installed browser was attempted as a fallback; its startup also failed with `socket() failed: Operation not permitted`. The browser suite and the pinned taste probe were then explicitly run and failed before measuring any UI. No screenshot, first-screen geometry, rendered contrast ratio, axe pass or taste score from the earlier fixed-build job is represented as this repair's observation. WebKit/Safari was not reached. Browser launch restrictions were not bypassed.

## Findings and disposition

| Severity / location | Finding, evidence, correction and recheck |
| --- | --- |
| High, fixed — `dist/index.html:1` | The initial checkout had no static entry or application. Restored the complete fixed build and source from the supplied job's actual delivery. The entry now exists; all ten assets match live downloads and the reproducibility build exactly; production DOM interactions pass. No game-code fix was necessary. |
| High, unresolved external operation — `artifacts/requested-record.json:2` | Exact TXT value is not publicly returned. Both HTTPS resolvers returned only the CNAME. No DNS write capability is available, so record publication and permanent retention cannot be fulfilled by this worker. IMD's authoritative DNS operator must add the supplied record and recheck. |
| Validation limitation — `test/browser.mjs:223` | Chromium could not start in either available route. Browser primary-interaction validation, taste measurements and first-screen inspection were attempted but remain unperformed. Restoring upstream source does not prove this machine rendered it. |

No new applicable UI source defect was established by the non-rendered checks. The task's explicit prohibition on game/design changes governed the restoration; no new design was introduced to satisfy generic visual preferences. `DESIGN.md` documents recovered source values and distinguishes source behavior from unperformed rendered checks.

## Packaging and completion limits

The delivered tree includes source, unchanged manifest/lockfile, required schema-validator source, all local runtime assets, licences, README, DESIGN.md and complete `dist/`. Its production export is **10 files / 1,689,081 bytes**. Final eligible-tree size is in [submission-size.json](artifacts/submission-size.json), below **8,388,608 bytes**.

The only ignore-file change has an explicit **256-byte `.gitignore` budget**; actual size is **94 bytes**. It excludes dependency and generated cache directories at every depth, compiler caches and scratch. `dist/` is not ignored. No dependency archive, registry mirror, cache, installed dependency directory, symlink or submodule is added to the delivery. Scratch installs/downloads and the entire scratch build are excluded and removed before submission.

The exact hostname and requested value are documented in the [DNS report](artifacts/dns-verification.md), together with actual dig output and a conditional owner-controlled custom-domain/DNSLink setup if IMD cannot support TXT records. That alternative was not performed and cannot verify this exact IMD hostname. This session's lack of write capability does not establish a platform-wide inability to host TXT records. No requester-only value is missing, so no placeholder or blocked-input file was created.

**The reported missing-output defect is fixed. Genesis ownership verification is still incomplete.**
