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

3. **Supabase Configuration:**
   - Copy `config/supabase-config.example.js` to `config/supabase-config.js`.
   - Fill in your Supabase project URL and anon key.
   - Or, set these in `window.supabaseConfig` in your HTML for GitHub Pages.

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

## Database Schema
- See `migration/README.md` for full schema, migration order, and ER diagram.

## Contact & Support
- For issues, open a GitHub issue or contact the development team.
- See `migration/README.md` for more troubleshooting tips. 