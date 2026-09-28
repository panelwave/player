# Contributing to PanelWave Player

Thanks for helping build the open-source player for the PanelWave format. This
guide covers the development setup, the conventions the code follows, and how
a change gets in.

## Development setup

```bash
git clone <repo-url> panelwave-player
cd panelwave-player
npm install

npm start                       # demo app on http://localhost:4200
ng build player                 # library -> dist/player/ (the demo builds against it)
ng build player --configuration production
```

The demo app (`projects/demo`) resolves `@panelwave/player` from `dist/player`
through `tsconfig` paths, so **rebuild the library after every library change**
or the demo (and the E2E suite) will keep running the old code.

### Tests

```bash
ng test player --watch=false --browsers=ChromeHeadless   # Jasmine + Karma unit suite
ng test player --watch=false --browsers=ChromeHeadless --code-coverage
npm run e2e                     # Playwright, chromium + mobile (Pixel 7 emulation)
npm run e2e:all                 # + firefox + webkit
npm run e2e:ui                  # Playwright UI mode
ng lint player
```

### Consumer smoke test (Angular compatibility)

```bash
ng build player --configuration production
npm run smoke:consumer -- --angular 22            # or 20 / 21
npm run smoke:consumer -- --angular 22 --zone     # zone.js app instead of zoneless
```

`scripts/consumer-smoke.mjs` packs `dist/player`, generates a fresh app with
that major's CLI in the OS temp dir, installs the tarball with strict peer
resolution, wires it up as the package README describes, runs a production
build and renders the demo manifest in headless Chromium (screenshot in
`test-results/`). CI runs it for every major in the `@angular/*` peer range;
when that range changes, change the `consumer-smoke` matrix in
`.github/workflows/ci.yml` with it. Needs a Node version the chosen CLI
accepts (Angular 22: Node >= 22.22.3; CI uses 24). `--manifest <file>`
additionally renders a manifest with speech bubbles, `--keep` keeps the app.

On Windows Karma needs the system Chrome:
`CHROME_BIN="C:\Program Files\Google\Chrome\Application\chrome.exe"`.

The E2E suite is hermetic (remote images are stubbed) and starts the demo dev
server itself on port 4222. Demo query hooks used by the tests:
`?manifest=<url>`, `?deny=<panelId>` (denying entitlement adapter),
`?vars=<url-encoded JSON>` (initial variables).

**Every change ships green:** unit suite, lint (zero problems) and the E2E
suite for anything that touches the shell, viewport or toolbar.

## Coding standards

- Angular 20 standalone components, `ChangeDetectionStrategy.OnPush`, signals
  or RxJS as the surrounding code does; `inject()` over constructor injection.
- Strict TypeScript. No `any` in library code (specs may use it); intentionally
  unused parameters are prefixed with `_`.
- The manifest is untrusted input: never `innerHTML` manifest text, never trust
  ids without checking the manifest, evaluate conditions only through
  `evaluateJsonLogic`.
- Rendering behaviour lives here, not in the CMS — the CMS embeds this library
  for preview. If the CMS needs different behaviour, add an input or event.
- Accessibility rules are enforced by lint: every clickable element is
  focusable and keyboard-operable; modals close on Escape and backdrop click;
  respect `prefers-reduced-motion`.
- Public API changes go through `projects/player/src/public-api.ts` and are
  documented in `docs/API.md`. Renaming an input/output is a breaking change.
- Format changes start in the schema repo (`schema/1.0/panelwave.schema.json`),
  then `@panelwave/types`, then the player. Keep the three in sync in one
  release train.

## Commit conventions

Conventional commits, imperative mood, scope optional:

```
feat(player): age gate, like/bookmark and branch chooser
fix(viewport): keep hover nav arrows above the speech bubbles
chore(player): lint to zero
docs: document the paywall inputs
```

Branches: `feature/*`, `bugfix/*`, `hotfix/*` off `master`. Squash noisy
work-in-progress commits before opening a PR; keep functional changes and
mechanical refactors in separate commits.

## Pull request process

1. Open the PR against `master` with a short description of the behaviour
   change and how you verified it (which suites ran).
2. CI runs lint, the unit suite, the library build and the E2E suite
   (`.github/workflows/ci.yml`). All jobs must be green.
3. Add a line under **Unreleased** in `CHANGELOG.md` for anything a library
   consumer would notice.
4. One approving review from a maintainer; the maintainer merges.

## Releasing

Releases are cut from `master` with `.github/workflows/release.yml`
(`workflow_dispatch` with the semver bump). It bumps the library version,
builds `dist/player`, publishes `@panelwave/player` to npm and creates the
GitHub release. Publishing uses npm trusted publishing (OIDC): there is no
`NPM_TOKEN` secret, and npm only accepts publishes from this repository's
`release.yml`, so don't rename that workflow.

## License

By contributing you agree that your contributions are licensed under the MIT
License that covers this project.
