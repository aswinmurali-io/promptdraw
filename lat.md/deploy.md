# Deploy

promptdraw builds to a plain static site in `dist/` with no backend, so any static host can serve it, at a domain root or under a sub-path.

## Static build

`npm run build` runs `tsc -b` and then `vite build`; a type error fails the build before anything is written.

- [[vite.config.ts]] sets `base: "./"`, so every asset URL in `dist/index.html` is relative. The same build works at `https://example.com/` and at a project sub-path such as `https://user.github.io/promptdraw/`, with no rebuild.
- Fonts are bundled from `@fontsource` packages and their OFL licence texts ship from `public/licenses/`; nothing is loaded from a CDN at runtime.
- `index.html` applies the saved theme in an inline script before first paint, so there is no light flash in dark mode.
- `npm run preview` serves `dist/` locally to check the production build.

## Hosting

Upload the contents of `dist/` to any static host; there are no rewrites, headers or environment variables to configure.

- **GitHub Pages:** set up in this repo; see [[deploy#Hosting#GitHub Pages]].
- **Netlify, Vercel or Cloudflare Pages:** build command `npm run build`, output directory `dist`.
- **Any web server or bucket:** copy `dist/` as is.

The app is a single page with no client-side routes, so no SPA fallback rule is needed.

### GitHub Pages

`.github/workflows/pages.yml` publishes the app to `https://aswinmurali-io.github.io/promptdraw/` on every push to `main`, and on manual dispatch.

The `build` job runs `npm ci`, `npm test` and `npm run build` on Node 22, then uploads `dist/` with `actions/upload-pages-artifact`; the `deploy` job publishes it with `actions/deploy-pages` to the `github-pages` environment. A failing test or type error stops the deploy. The repo's Pages source must be set to "GitHub Actions". The relative `base` means no Pages-specific build config is needed.

## Data and privacy

All user data stays in each visitor's browser, so hosting needs no server-side storage.

Settings, the task, view prefs, the theme and the saved workflow library live in `localStorage` under `promptdraw:*` keys (see [[ui#Persistence and files]] and [[stages#Workflow library]]). Data is per origin: moving the app to a new domain starts visitors with empty storage, and they carry settings across by exporting the JSON and opening it on the new site.

## Windows desktop build

`npm run package:win` wraps the static build in Electron and emits a single portable Windows exe, `release/promptdraw-<version>-portable.exe`.

- `electron/main.cjs` opens one window on `dist/index.html`, hides the menu bar, and sends external links to the default browser.
- electron-builder's `portable` target (config in the `build` field of `package.json`) packs `dist/`, `electron/` and `package.json` into an asar inside a self-extracting x64 exe. It builds from macOS without Wine.
- The exe is unsigned and uses the default Electron icon, so Windows SmartScreen warns on first run.
- Data lives in Electron's `localStorage` for the app, separate from any browser copy; carry settings across with JSON export/import.
