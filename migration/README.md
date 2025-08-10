# FSRS Database Complete Rewrite - Migration Guide

## Overview

This directory contains the complete rewrite of the FSRS spaced repetition database. All previous tables and data have been removed and replaced with a modern, optimized architecture designed for better FSRS algorithm implementation.

## ⚠️ IMPORTANT BREAKING CHANGES

**ALL PREVIOUS DATA HAS BEEN DELETED** - This is a complete fresh start:
- All user progress has been reset
- All existing cards and reviews have been removed
- FSRS parameters have been reset to defaults
- Users will need to start their learning journey from the beginning

## New Architecture Highlights

### 🎯 Modern FSRS Implementation
- **JSONB Parameter Storage**: FSRS weights stored as flexible JSON instead of 17 individual columns
- **0-3 Rating Scale**: Standard FSRS rating (Again=0, Hard=1, Good=2, Easy=3)
- **Decimal Precision**: Enhanced precision for stability/difficulty calculations
- **Immutable Review History**: Complete audit trail of all reviews for analytics

### 🏗️ Improved Database Design
- **Deck-Based Organization**: Cards organized in decks with per-deck settings
- **Separated Concerns**: Card templates (content) separate from user progress
- **Timezone Support**: User-specific timezones and day start times
- **Optimized Views**: Pre-built views for common client queries

### 🔒 Enhanced Security
- **Comprehensive RLS**: Row Level Security on all tables
- **Admin Functions**: Secure admin-only functions with proper permission checks
- **User Isolation**: Complete separation of user data

## Migration Files (Run in Order)

1. **01-extensions-and-enums.sql** - PostgreSQL extensions and custom enums
2. **02-profiles.sql** - Enhanced user profiles with timezone support
3. **03-subjects-and-decks.sql** - Subject hierarchy and new deck system
4. **04-card-templates.sql** - Shared card content templates
5. **05-user-cards.sql** - Individual user progress tracking
6. **06-reviews.sql** - Immutable review history
7. **07-fsrs-params.sql** - JSONB FSRS parameter storage
8. **08-user-flags-and-streaks.sql** - User flagging and streak systems
9. **09-loading-messages.sql** - Dynamic loading message system
10. **10-views.sql** - Optimized client-facing views
11. **11-final-optimizations.sql** - Performance indexes and sample data

## Database Schema Changes

### New Tables
- `profiles` - Enhanced user profiles with timezone/day start support
- `subjects` - Subject organization (similar to before but cleaner)
- `decks` - NEW: Per-deck settings and daily limits
- `card_templates` - Shared card content (replaces `cards`)
- `user_cards` - Individual user progress (replaces `user_card_progress`)
- `reviews` - Immutable review log (replaces `review_history`)
- `fsrs_params` - JSONB FSRS parameters (replaces individual w0-w16 columns)
- `user_card_flags` - User flagging system (enhanced)
- `user_streak_milestones` - Streak milestone tracking
- `streak_reward_configs` - Configurable streak rewards
- `user_streak_history` - Daily streak activity log
- `loading_messages` - Dynamic loading messages with context

### New Views for Client Consumption
- `v_due_user_cards` - Cards due for review
- `v_new_user_cards` - New cards ready for introduction
- `v_due_counts_by_deck` - Summary counts by deck for dashboard
- `v_user_study_session_info` - Complete study session information

## Key Improvements

### FSRS Algorithm
- **Better Parameter Management**: JSONB storage allows easier updates and optimization
- **Standard Rating Scale**: 0-3 scale aligns with FSRS research and other implementations
- **Enhanced Precision**: DECIMAL fields for more accurate calculations
- **Per-Deck Configuration**: Different FSRS settings for different learning contexts

### Database Performance
- **Optimized Indexes**: Strategic indexes for common query patterns
- **Efficient Views**: Pre-computed views reduce client query complexity
- **Better Constraints**: Enhanced data validation and consistency

### User Experience
- **Timezone Awareness**: Proper timezone handling for due date calculations
- **Deck Organization**: Better learning organization with deck-based limits
- **Streak System**: Enhanced streak tracking with configurable rewards
- **Loading Messages**: Context-aware loading messages for better UX

## Client Code Migration Required

### Rating Scale Change
```javascript
// OLD (1-4 scale)
const RATING_OLD = {
    AGAIN: 1,
    HARD: 2, 
    GOOD: 3,
    EASY: 4
};

// NEW (0-3 scale)
const RATING_NEW = {
    AGAIN: 0,
    HARD: 1,
    GOOD: 2, 
    EASY: 3
};
```

### FSRS Parameters Access
```javascript
// OLD (individual columns)
const stability = fsrsParams.w0;

// NEW (JSONB access)
const stability = fsrsParams.weights.w0;
```

### Database Queries
```javascript
// OLD
const cards = await supabase.from('user_card_progress')
    .select('*, cards(*)')
    .eq('user_id', userId)
    .lte('due_date', new Date());

// NEW (using views)
const cards = await supabase.from('v_due_user_cards')
    .select('*')
    .eq('user_id', userId);
```

## Essential Functions

### Review Processing
Use `process_card_review()` function to handle complete review workflow:
```sql
SELECT process_card_review(
    user_id,
    card_template_id, 
    deck_id,
    rating, -- 0-3 scale
    response_time_ms,
    new_stability,
    new_difficulty,
    new_due_at,
    new_state
);
```

### Study Queue
Use `get_user_study_queue()` for mixed due/new card queues:
```sql
SELECT * FROM get_user_study_queue(user_id, deck_id, max_new, max_due);
```

## Sample Data

Sample subjects, cards, and streak rewards have been created. Use the following to test:

1. **Mathematics Subject**: Basic math cards (2+2, 5×6)
2. **Science Subject**: General science knowledge
3. **Streak Rewards**: 3, 7, 30, and 100-day milestones

## Verification

Run the integrity check function to verify the migration:
```sql
SELECT * FROM verify_database_integrity();
```

Should return:
- Tables Check: PASS (11 tables)
- Enums Check: PASS (3 enums)
- Views Check: PASS (4+ views)

## Next Steps

1. **Update Client Code**: Migrate to 0-3 rating scale and new schema
2. **Test FSRS Calculations**: Verify JSONB parameter access works correctly
3. **Update UI Components**: Modify rating buttons and deck selection
4. **Test Views**: Ensure client queries work with new views
5. **Performance Testing**: Verify query performance with new indexes

## Rollback Strategy

⚠️ **No rollback available** - This is a complete rewrite. If issues occur:
1. Restore from backup taken before migration
2. Or re-run individual migration files to rebuild schema
3. Contact development team for assistance

## Support

For issues with this migration:
1. Check migration logs in Supabase dashboard
2. Verify all 11 migration files were applied successfully
3. Run `verify_database_integrity()` to check system health
4. Review client code for required updates

---

**Migration completed successfully!** 
Your FSRS database is now modernized and ready for enhanced spaced repetition learning.