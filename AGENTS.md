# Repository Guidelines

## Project Structure & Module Organization
- HTML entry points: `index.html` (study), `login.html`, `dashboard.html`, `admin.html`.
- Source: `js/` (ES modules). Key: `script.js` (app controller), `auth.js`, `database.js`, `fsrs.js`, `supabase-client.js`, `config-loader.js`.
- Styles: `css/` (page/feature styles). Config: `config/` (Supabase JSONs; example files tracked).
- Data & SQL: `migration/` (schema, RLS policies, views). Tests: `tests/` (HTML runners), `scripts/` (audit/build).

## Build, Test, and Development Commands
- `npm run audit-imports` — validate imports/exports.
- `npm run lint` — run ESLint.
- `npm run build` — bundle to `dist/bundle.js` and syntax‑check.
- Serve locally (examples): `npx serve .` or `python3 -m http.server 5500`; open `http://localhost:5500/index.html`.
- Open `tests/index.html` for connectivity/security smoke tests.

## Database & FSRS Overview
- Core tables:
  - `profiles` (timezone, daily limits, streaks), `card_templates` (Q/A + flags),
    `user_cards` (FSRS state: `state`, `stability`, `difficulty`, `due_at`),
    `reviews` (immutable before/after states, rating, timing),
    `fsrs_params` (JSONB weights w0–w18, intervals/limits, desired retention).
- Optimized views: `v_due_user_cards` (due list with joins), `v_new_user_cards` (introducible cards),
  `v_user_study_session_info` (session config), `v_due_counts_by_deck` (dashboard).
- FSRS module (`js/fsrs.js`): 0–3 rating scale (Again=0, Hard=1, Good=2, Easy=3).
  - Core functions: `updateStability`, `updateDifficulty`, `calculateNextReview` (scheduling), plus initial value helpers.
  - Integration: `database.js` persists updates to `user_cards` and appends `reviews` with full before/after state.

## Coding Style & Naming Conventions
- Vanilla JS (ES6+). Filenames: kebab-case (`user-avatar.js`); Classes: PascalCase; methods/vars: camelCase.
- Export class and a default instance where useful.
- Lint with `eslint.config.js`; resolve warnings before PRs.

## Testing Guidelines
- Tests live in `tests/` as HTML pages (e.g., `tests/database-test.html`). Keep focused and self-contained.
- Local Supabase required: create `config/supabase-config.local.json` with `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Commit & Pull Request Guidelines
- Commits: concise, imperative; prefer conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`).
- PRs: describe intent, link issues, include screenshots for UI and exact test steps.

## Security & Configuration Tips
- Never commit secrets. Ignored: `config/supabase-config.local.json`, `config/supabase-config.js`, `.env`.
- CI writes `config/supabase-config.json` from repository secrets.
- Supabase Auth: set Site URL to your domain; add localhost redirect URLs (login/reset) in Dashboard.

