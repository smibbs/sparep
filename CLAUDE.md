# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a web-based spaced repetition flashcard application built with vanilla JavaScript and Supabase. It implements the FSRS (Free Spaced Repetition Scheduler) algorithm for optimized learning intervals.

## Architecture

### Frontend Structure
- **Vanilla JavaScript ES6 modules** - No framework dependencies
- **Multi-page application** with separate HTML files:
  - `index.html` - Main flashcard interface
  - `login.html` - Authentication
  - `dashboard.html` - User statistics and progress
- **Modular JavaScript architecture**:
  - `js/script.js` - Main application logic and session management
  - `js/sessionManager.js` - Handles 10-card batch sessions
  - `js/database.js` - Database service layer
  - `js/auth.js` - Authentication service
  - `js/fsrs.js` - FSRS algorithm implementation
  - `js/admin.js` - Admin analytics interface

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

### Session Management
- **10-card batch sessions** cached in sessionStorage
- **Batch submission** at session completion
- **State persistence** across page refreshes
- **Rating system**: 1 (again), 2 (hard), 3 (good), 4 (easy)

## Common Commands

### Initial Setup
```bash
# Install dependencies
npm install

# Set up Supabase configuration
cp config/supabase-config.example.js config/supabase-config.js
# Edit config/supabase-config.js with your Supabase URL and anon key

# Or copy environment example for reference
cp env.example .env
```

### Database Operations
```bash
# Apply migrations manually in Supabase SQL Editor (run files 01-12 in order)
# See migration/README.md for complete setup instructions

# Run card migration script (if needed)
npm run migrate

# Generate TypeScript types (if using Supabase CLI)
supabase gen types typescript --local > types/database.ts

# View database logs (if using Supabase CLI)
supabase logs
```

### Development
```bash
# Serve locally (requires simple HTTP server)
python3 -m http.server 8000
# OR
npx http-server
# OR use VSCode Live Server extension

# Open application
open http://localhost:8000
```

### Testing
- Manual testing via `tests/database-test.html`
- Test completion card: `test-completion-card.html`
- Test user authentication and database connectivity
- Verify FSRS calculations and session management

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
- RLS policies control data access per user
- Admin functions use `SECURITY INVOKER` (not `SECURITY DEFINER`)
- Card flagging system for content moderation

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

## Configuration

### Required Files
- `config/supabase-config.js` - Supabase connection (copy from `.example`)
- Environment variables for production deployment

### Supabase Setup
- Enable RLS on all tables
- Apply migration files sequentially
- Configure authentication providers
- Set up Edge Functions for analytics

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

## Database Migration Process

Migrations are located in `/migration/` and must be run sequentially (01-12):

1. **01-initial-setup.sql** - Basic database setup and extensions
2. **02-enums.sql** - Custom enum types
3. **03-user-profiles.sql** - User authentication and tier system
4. **04-subjects.sql** - Subject organization
5. **05-cards.sql** - Flashcard content
6. **06-user-card-progress.sql** - FSRS progress tracking
7. **07-review-history.sql** - Review audit trail
8. **08-fsrs-parameters.sql** - Personalized algorithm parameters
9. **09-user-card-flags.sql** - User flagging system
10. **10-functions-and-procedures.sql** - Helper functions
11. **11-policies-and-security.sql** - RLS policies
12. **12-sample-data.sql** - Optional sample data (development only)

**Important**: Use Supabase SQL Editor to run each file in order. Check `migration/README.md` for complete ER diagram and troubleshooting.

## Development Guidelines

### Code Style
- Write minimal, precise code - no sweeping changes
- Focus only on the specific task at hand
- Make code modular and testable
- Never break existing functionality
- No framework dependencies - pure vanilla JavaScript

### State Management
- Session state stored in `sessionStorage` for 10-card batches
- FSRS parameters and progress persist in database
- Real-time subscriptions for live updates
- Batch operations to minimize database calls