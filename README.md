# Flashcard App (sparep)

A modern, database-backed spaced repetition flashcard app with user authentication, statistics dashboard, and Supabase integration.

## Features
- User authentication (Supabase Auth)
- Study flashcards with spaced repetition (FSRS algorithm)
- Track progress and review history
- Dashboard with statistics and subject breakdown
- Responsive, mobile-friendly UI
- GitHub Pages deployment

## Local Development Setup

1. **Clone the repository:**
   ```sh
   git clone https://github.com/yourusername/sparep.git
   cd sparep
   ```
2. **Install dependencies (if any):**
   - This project is pure HTML/CSS/JS, no build step required.
   - For local testing, use a static server (e.g. `npx serve` or VSCode Live Server).

3. **Supabase Configuration (local + prod):**
   - Preferred (prod & local): create `config/supabase-config.json` with `{ "SUPABASE_URL": "...", "SUPABASE_ANON_KEY": "..." }`.
   - Local-only option: create `config/supabase-config.local.json` (see `config/supabase-config.local.example.json`). This is picked up automatically on localhost if `supabase-config.json` is absent.
   - Legacy fallback: `config/supabase-config.js` that sets `window.supabaseConfig = { SUPABASE_URL, SUPABASE_ANON_KEY }` is also supported.
   - If none exist, `config/supabase-config.example.json` (placeholders) is loaded and auth will fail by design.

4. **Environment Variables:**
   - Not required for static hosting. For local dev, use the config file above.

## Supabase Project Setup

1. **Create a new Supabase project** at https://app.supabase.com/
2. **Run all migrations in `/migration` in order** using the SQL editor.
   - See `migration/README.md` for details and ER diagram.
3. **Enable Row Level Security (RLS)** on all tables as per migrations.
4. **Grant permissions:**
   - Ensure the `authenticated` role has `SELECT/INSERT/UPDATE` as needed (see troubleshooting below).
5. **Set up storage buckets** if using avatars/images.

## Running Migrations
- Use the Supabase SQL editor to run each `.sql` file in `/migration` in order.
- Check for errors after each step.
- See `migration/README.md` for troubleshooting and maintenance tips.

## Deployment (GitHub Pages)
1. **Push to main branch.**
2. **GitHub Actions will deploy automatically** using `.github/workflows/deploy.yml`.
3. **Access your app at:**
   `https://yourusername.github.io/sparep/`

### Production secrets injection
The workflow `.github/workflows/deploy.yml` writes `config/supabase-config.json` at build time from repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Ensure both secrets are set in GitHub → Settings → Secrets and variables → Actions.

### Supabase Auth redirect settings (required)
In Supabase Dashboard → Authentication → URL Configuration:
- Set Site URL to your domain, e.g. `https://nanotopic.co.uk`.
- Add Additional Redirect URLs for both production and local dev, for example:
  - `https://nanotopic.co.uk/`, `https://nanotopic.co.uk/login.html`, `https://nanotopic.co.uk/reset-password.html`
  - `http://localhost:5500/`, `http://localhost:5500/login.html`, `http://localhost:5500/reset-password.html` (adjust the port you use)
  - `http://127.0.0.1:5500/`, `http://127.0.0.1:5500/login.html`, `http://127.0.0.1:5500/reset-password.html`
These URLs are used for email confirmations and password reset (`resetPasswordForEmail`) which calls back to `reset-password.html`.

## Troubleshooting
- **403 Forbidden or Permission Denied:**
  - Make sure RLS is enabled and policies are correct.
  - Grant `SELECT` on all tables to `authenticated` role:
    ```sql
    GRANT SELECT ON public.cards TO authenticated;
    GRANT SELECT ON public.subjects TO authenticated;
    -- Repeat for other tables as needed
    ```
- **No statistics or cards load:**
  - Check Supabase API keys and URL.
  - Check browser console for errors.
- **Migrations fail:**
  - Run in order, check for missing extensions or permissions.

## Testing
- Manual testing: login, study cards, check dashboard, logout.
- See `/tests/database-test.html` for database connectivity tests.


## Development Checks
Run these scripts to catch missing or invalid imports before they reach the browser:

```sh
npm run audit-imports
npm run lint
npm run build
```

- `audit-imports` verifies every import matches an existing export.
- `lint` uses ESLint to flag unresolved or unused imports.
- `build` bundles the project and fails if any modules are missing.

Together these steps help prevent runtime import errors by validating your code during development.

## Configuration Imports
All configuration objects are exported from `js/config.js`, including the new `CACHE_CONFIG`:

```js
import { SESSION_CONFIG, CACHE_CONFIG } from './js/config.js';
```

Use this import pattern in examples and guides to ensure caching settings are available.
## Database Schema
- See `migration/README.md` for full schema, migration order, and ER diagram.

## Contact & Support
- For issues, open a GitHub issue or contact the development team.
- See `migration/README.md` for more troubleshooting tips.

*Updated: Testing GitHub Pages deployment automation*
