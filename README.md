# Squeek Beat-the-AI Predictor

Squeek Beat-the-AI Predictor is a community project for the Squeekchain Buildooooor badge.

**DNS verification is incomplete.** This session could not publish the requested TXT record. Google and Cloudflare returned a CNAME, with no matching TXT value. IMD's DNS operator must add the exact record below and keep it permanently. No DNS record, live domain, game rule, application code, or visual design was changed.

The **2026-11-08 documentation revision** delivers the missing DNS evidence and conditional fallback below. Build and interaction results elsewhere in this README describe the previous repair; they were not rerun for this documentation-only change. Current checks and remaining limitations are in the [DNS handoff](artifacts/dns-verification.md#revision-scope-and-validation).

This repair restores the missing `dist/index.html`, its complete assets, source, package manifest and lockfile from the **existing fixed build**. It is not a new game or launch. The fixed build's public [IMD job result](https://api.imd.fun/jobs/b7fd99d8-31ac-4482-ad29-d3dfd6095e80/result) identifies [the fixed source repository](https://github.com/identity-md-launches/launch-3136-continue-existing-squeek-beat-the-ai/tree/3db1ea0dd69e988b50fff608001a5d95b9537041). All ten restored export files match downloads from the [existing live site](https://squeek-beat-the-ai-predicto-b7fd.imd.site/) byte for byte. Provenance and SHA-256 hashes are in [artifacts/restoration.json](artifacts/restoration.json). The originally supplied [launch-3134 repository](https://github.com/identity-md-launches/launch-3134-build-publish-squeek-beat-the-ai) contains an older export and was not substituted for the fixed game.

Built through the IdentityMD contributor network ([imd.fun](https://imd.fun)). Preserve the community-project sentence and contributor attribution in redistributed source and the published site. No Genesis verification, approval, badge, whitelist, airdrop or reward is claimed.

## Exact DNS record

| Field | Required value |
| --- | --- |
| Authoritative zone | `imd.site` |
| Type | `TXT` |
| Host | `_squeekchain.squeek-beat-the-ai-predicto-b7fd` |
| Full name | `_squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site` |
| Value | `squeekchain-verify=3452d927d546e768a632c5e6a0ca32d0ad429c16bcf8d287` |
| Retention | Permanent; the request says Genesis rechecks daily |
| Deadline supplied | November 15, 10:54 AM; timezone unspecified |

### Lookup evidence from this revision

Checked **2026-11-08 at 04:36:07 UTC**. The literal command was:

```sh
dig TXT _squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site
```

It exited **9**, with empty stderr and this actual stdout:

```text
;; UDP setup with 46.38.252.230#53(46.38.252.230) for _squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site failed: network unreachable.
;; no servers could be reached
;; UDP setup with 46.38.252.230#53(46.38.252.230) for _squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site failed: network unreachable.
;; no servers could be reached
;; UDP setup with 46.38.252.230#53(46.38.252.230) for _squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site failed: network unreachable.
;; UDP setup with 46.38.225.230#53(46.38.225.230) for _squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site failed: network unreachable.
;; UDP setup with 2a03:4000:8000::fce6#53(2a03:4000:8000::fce6) for _squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site failed: network unreachable.
;; no servers could be reached
```

This is a local UDP lookup failure, not a DNS answer or evidence that IMD cannot support TXT records. Independent HTTPS TXT queries to [Google](https://dns.google/resolve?name=_squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site&type=TXT) and [Cloudflare](https://cloudflare-dns.com/dns-query?name=_squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site&type=TXT) both returned HTTP 200 and DNS `Status: 0` (NOERROR):

| Resolver | Answers to the TXT query | Requested value returned? |
| --- | --- | --- |
| Google | One type-5 CNAME to `6vqfumox.up.railway.app.`; zero type-16 TXT answers | No |
| Cloudflare | One type-5 CNAME to `6vqfumox.up.railway.app.`; zero type-16 TXT answers | No |

**The required TXT value does not resolve in either observed public response; Genesis verification remains incomplete.** No DNS write tool is available in this session. IMD's ability to publish this TXT record remains unconfirmed; no claim of platform-wide non-support is made. IMD's DNS operator must publish the exact record above and retain it permanently, preserving the existing website and every other record. The owner cannot add this IMD-controlled record at a different DNS provider.

The [DNS report](artifacts/dns-verification.md), [full dig transcript](artifacts/dig.txt), [timestamped resolver responses](artifacts/dns-verification.json), and [unapplied record specification](artifacts/requested-record.json) are delivered with this revision. These are evidence and handoff documents; they do not configure authoritative DNS.

### Conditional alternative if IMD confirms TXT publication is unsupported

1. Use a domain controlled by the site owner, with access to its authoritative DNS provider.
2. Have IMD explicitly confirm custom-domain support and configure support for serving **this existing site** at that domain. Obtain the actual hosting DNS records from IMD; do not guess a target or change the existing IMD mapping.
3. Register that owner-controlled domain in Genesis and obtain its corresponding verification hostname and TXT value. Do not assume that the token supplied for the IMD hostname applies to a different domain.
4. Publish the new Genesis TXT record at that domain's authoritative DNS provider and keep it permanently.
5. Run `dig TXT` with the exact new hostname issued by Genesis, confirm the exact new value is returned publicly, and complete verification in Genesis.

**Custom-domain support is unconfirmed. This alternative does not verify `_squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site` or the original IMD hostname.** These are conditional handoff steps, not actions performed in this revision. No site, domain mapping, or DNS record was changed during this review.

After IMD's operator publishes the record, check:

```sh
dig TXT _squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site
dig @1.1.1.1 TXT _squeekchain.squeek-beat-the-ai-predicto-b7fd.imd.site
```

A successful result must contain the exact TXT value. A CNAME alone does not verify ownership. Preserve the existing website mapping and every other DNS record.

## Install, preview and rebuild

Requires Node.js 22 or newer and npm. From the repository root:

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

Use the local HTTP URL printed by Vite. `dev` and `preview` bind to localhost. The complete static export is already included in `dist/`; no dependency installation or build is needed to serve that directory with a static HTTP server. Preview serves `dist/`, whereas dev serves the source. Avoid `file://` because this application uses ES modules.

`npm run build` first regenerates the required standalone JSON-schema validators, then runs Vite. `vite.config.ts` sets `base: './'`, so emitted HTML, module imports, CSS and font URLs work under a static-hosting subpath. A single HTML entry and hash-based friend links require no server rewrites. There are no private keys, environment files, wallet connections or backend services. Public Squeekchain feed requests require a network connection; Practice is local after the app assets load.

The repair's build was run only in `test/scratch/fixed-upstream/` to preserve the restored delivery. That build reproduced every committed export file exactly. Application source, build configuration, manifest and lockfile remain identical to the fixed build.

## Play and check interactions

Choose **Practice**, choose **Nap** or **Sprint** (with a block bracket for Sprint), and lock the call. **Reveal practice round** shows the result, points, streak and artwork. Practice cycles through a nap, a small sprint and a large sprint. Its scores and collection remain separate from Live. Navigate to Art and Awards; inspect an artwork and download its PNG. Progress stays in this browser's storage, not a global leaderboard.

Live mode predicts confirmed settlement outcomes. Stale, unavailable or incompatible feed data disables new live calls and offers **Play practice** and **Retry now**. Submitted settlements remain pending until confirmed. Live availability and settlement timing depend on the public API. The transparent deterministic Professor uses confirmed historical rounds; the game sends no AI-service requests. Correct calls earn +10, correct sprint brackets +15, and consecutive correct calls earn +5 times the current streak. This is a free points game on Sepolia, with no financial promises or mainnet transaction flow.

`npm test` runs the network-independent unit tests. The existing browser suite needs Playwright and an installed Chromium supplied separately:

```sh
IMD_PLAYWRIGHT=/absolute/path/to/playwright/index.mjs \
PLAYWRIGHT_BROWSERS_PATH=/absolute/path/to/installed/browsers \
npm run test:browser
```

The browser suite serves the built export in a bounded foreground process, applies the hosted Content Security Policy, intercepts feed requests with labelled fixtures, and advances a virtual clock. It checks primary practice/live flows, persistence, duels, downloads, pending confirmation, API recovery and mobile layouts. It does not certify actual live outcomes or Genesis verification. Check results and limitations from **this repair** are in [VALIDATION.md](VALIDATION.md); design tokens, typography, components and responsive behavior are in [DESIGN.md](DESIGN.md).

## Source and packaging

- `src/App.tsx`, `src/game.ts`: existing interface, prediction logic and scoring.
- `src/api.ts`, `src/useFeed.ts`, `src/schemas/`, `src/validation/`: public-feed reads, official schemas and required standalone validators.
- `src/Characters.tsx`, `src/art.ts`, `src/ArtCanvas.tsx`: existing characters and deterministic art.
- `public/`: local font, favicon, share art and font licence; copied into `dist/`.
- `test/browser.mjs`, `test/fixtures/`, `src/*.test.ts`: existing reproducible tests; fixtures are not part of the runtime export.
- `artifacts/`: DNS evidence, restoration integrity and current validation evidence.

The explicit ignore-file path budget is **`.gitignore`: at most 256 bytes**, detailed in [artifacts/path-budget.md](artifacts/path-budget.md). It excludes `**/node_modules/`, `**/.cache/`, `**/.npm/`, `**/.vite/`, `**/.parcel-cache/`, `/test/scratch/` and `*.tsbuildinfo`. `dist/` remains included. Source schemas, generated validators, local runtime assets and licences are required and retained. No package archives, dependency mirrors, submodules, source maps or installed dependencies are delivered. The final deliverable must remain under 8 MiB; the measured size is recorded in validation.

Design guidance: Jakub Krehel's Better Interface (MIT), pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`; documentation guidance adapted from Paul Bakaus's Impeccable (Apache-2.0), commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. Preserved notices and licences are in `docs/design-guide-LICENSE.txt`. Outfit's SIL Open Font License is in `public/FONT-LICENSE.txt` and `dist/FONT-LICENSE.txt`. The existing Lucide dependency retains its upstream licence.
