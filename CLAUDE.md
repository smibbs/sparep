# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based spaced repetition flashcard application built with vanilla JavaScript and Supabase. It implements the FSRS (Free Spaced Repetition Scheduler) algorithm for optimized learning intervals.

## Architecture

### Core Philosophy
- **Pure vanilla JavaScript ES6 modules** - Zero framework dependencies, no build step
- **Multi-page application** - Traditional HTML pages with shared JavaScript modules
- **Client-side session management** - 10-card batches cached in sessionStorage/localStorage
- **Database-first design** - Supabase PostgreSQL with comprehensive RLS policies

### Application Structure
**Pages:**
- `index.html` - Main flashcard study interface
- `login.html` - Authentication and registration
- `dashboard.html` - Progress statistics and analytics
- `admin.html` - Admin analytics and content management
- `profile.html` - User settings and preferences
- `reset-password.html` - Password recovery

**Core JavaScript Modules:**
- `script.js` - Main application controller and UI logic
- `sessionManager.js` - 10-card batch session handling and storage management
- `database.js` - Supabase database service layer with RLS-aware queries
- `auth.js` - Authentication service and user session management

**FSRS Algorithm Layer:**
- `fsrs.js` - Core FSRS algorithm implementation (stability, difficulty, retrievability)
- `fsrsScheduler.js` - Card scheduling and interval calculations
- `fsrsParameters.js` - User-specific algorithm parameter management
- `fsrsOptimization.js` - Algorithm optimization and parameter tuning
- `fsrsAnalytics.js` - Learning analytics and performance insights

**UI and Features:**
- `slideMenu.js` - Navigation slide-out menu
- `streakService.js` + `streakUI.js` - Daily streak tracking system
- `onboarding.js` - New user guided setup flow
- `navigation.js` - Client-side routing between pages

### Backend (Supabase)
- **PostgreSQL database** with Row Level Security (RLS)
- **Real-time subscriptions** for live updates
- **Edge functions** for advanced analytics
- **User tier system**: free (20 cards/day), paid (unlimited), admin

### Database Schema
Core tables managed through migration files in `/migration/`:
- `cards` - Flashcard content with flagging system
- `user_card_progress` - FSRS tracking per user/card
- `review_history` - Complete review audit trail
- `subjects` - Content organization
- `user_profiles` - User tiers and limits

### Session Management Architecture
- **Batch-based learning** - Cards loaded in groups of 10 for optimal cognitive load
- **Client-side caching** - SessionManager handles localStorage/sessionStorage with Safari fallbacks
- **Progressive submission** - Reviews submitted as batch on session completion to minimize DB calls
- **State persistence** - Session survives page refreshes and browser navigation
- **Adaptive storage** - Automatically detects and handles Safari private browsing limitations
- **FSRS integration** - Each review updates stability, difficulty, and next review interval

## Common Commands

### Initial Setup
```bash
# Install dependencies (Supabase client only)
npm install

# Set up Supabase configuration for local development
cp config/supabase-config.example.js config/supabase-config.js
# Edit config/supabase-config.js with your Supabase URL and anon key
```

### Database Operations
```bash
# Run card migration script (Node.js-based data migration)
npm run migrate

# Apply database schema migrations manually in Supabase SQL Editor
# Run migration files 01-12 sequentially (see migration/README.md)

# Generate TypeScript types (if using Supabase CLI)
supabase gen types typescript --local > types/database.ts

# View database logs (if using Supabase CLI)
supabase logs
```

### Development
```bash
# Serve locally (vanilla JS - no build step required)
python3 -m http.server 8000
# OR
npx http-server
# OR use VSCode Live Server extension

# Open application
open http://localhost:8000

# Troubleshooting: Safari HTTPS/Cache Issues
# If Safari shows SSL errors or serves cached content:
# 1. Clear Safari cache: Shift+Cmd+R or Safari → Settings → Privacy → Manage Website Data → Remove All
# 2. Security headers are conditionally applied (localhost bypassed, production enforced)
```

### Deployment
```bash
# Automatic deployment via GitHub Actions on push to main
# Requires SUPABASE_URL and SUPABASE_ANON_KEY secrets in GitHub repository

# Manual deployment trigger
gh workflow run deploy.yml
```

### Testing
- **No automated test suite** - this is a vanilla JS application
- Manual testing via `tests/database-test.html` for database connectivity
- **Security testing**: `tests/security-validation-test.html` for input sanitization and XSS protection
- **Client-server security**: `tests/client-server-security-test.html` for architecture verification
- Test user authentication, session management, and FSRS calculations manually
- Verify 10-card batch sessions and progress persistence
- **Admin security testing**: Verify dual-check pattern and periodic validation work correctly

## Key Implementation Details

### FSRS Algorithm
- Implemented in `js/fsrs.js` with stability and difficulty calculations
- Cards transition through states: 'new' → 'learning' → 'review'
- Special handling for "again" ratings (10-minute intervals)

### User Tiers and Limits
- Free users: 20 cards per day (2 sessions of 10 cards each)
- Paid users: unlimited sessions
- Admin users: access to analytics dashboard

### Security Model
- **Client-Server Security Architecture**: Clear separation between client-side UI optimization and server-side security enforcement
- **RLS policies** control data access per user with `auth.uid()` verification
- **Admin functions** use `SECURITY DEFINER` with proper admin verification
- **Dual-check pattern** for critical operations: client-side UX + server-side security verification
- **Card flagging system** with enhanced input sanitization and XSS protection
- **Periodic admin validation** to prevent session hijacking and privilege escalation
- **Conditional security headers**: HTTPS enforcement and HSTS only apply in production, not localhost

### Session Flow
1. Load 10 cards (due cards + new cards as needed)
2. Present cards one at a time with flip/rate interface
3. Handle "again" ratings by cycling cards back
4. Batch submit all ratings on session completion
5. Update FSRS parameters and schedule next reviews

### Analytics (Admin Only)
- Hesitation pattern analysis
- Error streak tracking
- Difficulty consistency metrics
- Problem score calculation for card identification

### User Experience Features
- **Streak System**: Track daily learning streaks with visual feedback and rewards
- **Onboarding Flow**: Guide new users through application setup and first session
- **Profile Management**: User settings, preferences, and account management
- **Navigation System**: Slide-out menu for easy access to different sections
- **Avatar System**: User profile pictures and visual identity

## Configuration and Deployment

### Dual Configuration System
**Local Development:**
- Copy `config/supabase-config.example.js` to `config/supabase-config.js`
- File sets `window.supabaseConfig` for global access (no ES6 exports to avoid syntax errors)
- **NEVER commit** - file is in `.gitignore`
- Common issues:
  - 404 error: File doesn't exist, needs to be created from example
  - Syntax error: Remove ES6 `export` statements (file loaded as regular script, not module)

**Production (GitHub Pages):**
- GitHub Actions generates `config/supabase-config.js` from repository secrets
- Secrets: `SUPABASE_URL` and `SUPABASE_ANON_KEY` must be set in GitHub repository settings
- Deployment workflow validates secrets and injects them into the config file
- Generated file matches local development structure (no exports, global window object)

### GitHub Actions Deployment
- **Automatic deployment** on push to `main` branch via `.github/workflows/deploy.yml`
- **Config generation** - Creates supabase-config.js from GitHub secrets during build
- **Validation** - Ensures secrets are properly injected before deployment
- **Pages deployment** - Uploads entire directory as static site to GitHub Pages

### Supabase Database Setup
- Enable RLS on all tables (handled by migrations)
- Apply migration files 01-12 sequentially via Supabase SQL Editor
- Configure authentication providers in Supabase dashboard
- See `migration/README.md` for complete setup instructions

## Important Considerations

### Performance
- SessionManager handles local caching to minimize database calls
- 10-card batch operations reduce server load
- Analytics views are pre-computed for admin dashboard

### Data Integrity
- FSRS calculations preserve learning progress
- Review history maintains complete audit trail
- User card progress tracks all learning metrics

### Content Management
- Card flagging system for user-reported issues
- Admin interface for content review and management
- Subject-based organization with access controls

## Database Migration System

### Migration Organization
**Core Schema (01-12)** - Run these for fresh database setup:
- **01-02**: Database foundations (setup, enums)
- **03-04**: User system (profiles, subjects)  
- **05-07**: Card system (cards, progress, history)
- **08-09**: FSRS system (parameters, flagging)
- **10-12**: Functions, security, sample data

**Incremental Updates (13-32)** - Historical fixes and optimizations:
- Security enhancements, function fixes, performance optimizations
- **Migration 31**: Enhanced card flagging security with input sanitization
- **Migration 32**: Secure admin verification functions for client-server security
- Only needed when updating existing databases or understanding evolution

### Setup Process
1. **Fresh Database**: Run migrations 01-12 sequentially in Supabase SQL Editor
2. **Development**: Include migration 12 (sample data) for testing
3. **Production**: Skip migration 12 (no sample data)
4. **Troubleshooting**: See `migration/README.md` for complete ER diagram and detailed instructions

### Migration File Reference
See `migration/README.md` - contains complete documentation including:
- Detailed migration descriptions and dependencies
- Database schema ER diagram  
- Troubleshooting guide for common issues
- Schema alignment verification steps

## Development Guidelines

### Key Principles
- **Minimal, precise changes** - Focus only on the specific task at hand
- **No framework dependencies** - Maintain pure vanilla JavaScript approach
- **Preserve existing functionality** - Never break working features
- **Database-first thinking** - Leverage Supabase RLS and real-time features
- **Mobile-responsive design** - Test across device sizes

### State Management Patterns
- Session state stored in `sessionStorage` for 10-card batches
- FSRS parameters and progress persist in database
- Real-time subscriptions for live updates where needed
- Batch operations to minimize database calls and improve performance

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.