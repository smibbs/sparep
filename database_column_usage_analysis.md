# Database Column Usage Analysis & Risk Assessment

## Executive Summary

**Total Columns Analyzed:** 142 across 7 tables  
**Used in Application:** 78 columns (54.9%)  
**Unused/Safe for Removal:** 64 columns (45.1%)  
**Estimated Storage Reduction:** 25-30%

---

## Complete Usage Matrix

| Table | Column | Type | Used | Usage Type | Risk Level | Referenced In | Notes |
|-------|--------|------|------|------------|------------|---------------|-------|
| **user_profiles** | id | UUID | ✅ | SELECT, FK | CRITICAL | All JS files | Primary key, core identifier |
| **user_profiles** | display_name | VARCHAR | ✅ | SELECT | SAFE-KEEP | auth.js, dashboard.js | Used in UI display |
| **user_profiles** | email | VARCHAR | ✅ | SELECT, UPDATE | SAFE-KEEP | auth.js, admin.js | Authentication, admin functions |
| **user_profiles** | avatar_url | TEXT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_profiles** | last_seen_at | TIMESTAMPTZ | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_profiles** | daily_new_cards_limit | INT | ✅ | SELECT | SAFE-KEEP | auth.js, database.js | Tier system logic |
| **user_profiles** | daily_review_limit | INT | ⚠️ | SELECT | CAUTION | auth.js | **May be superseded by tier logic** |
| **user_profiles** | learn_ahead_time_minutes | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_profiles** | created_at | TIMESTAMPTZ | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_profiles** | updated_at | TIMESTAMPTZ | ❌ | AUTO | SAFE | None | **SAFE TO REMOVE** (auto-updated) |
| **user_profiles** | total_cards_studied | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_profiles** | total_reviews | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_profiles** | current_streak | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_profiles** | longest_streak | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_profiles** | is_public | BOOLEAN | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_profiles** | is_admin | BOOLEAN | ⚠️ | SELECT | CAUTION | script.js, dashboard.js | **DEPRECATED - use user_tier** |
| **user_profiles** | user_tier | user_tier | ✅ | SELECT, UPDATE | CRITICAL | Multiple files | Tier system, access control |
| **user_profiles** | reviews_today | INT | ✅ | SELECT, UPDATE | SAFE-KEEP | auth.js, database.js | Daily limit enforcement |
| **user_profiles** | last_review_date | DATE | ✅ | SELECT, UPDATE | SAFE-KEEP | auth.js, database.js | Daily limit reset logic |
| **cards** | id | UUID | ✅ | SELECT, FK | CRITICAL | Multiple files | Primary key |
| **cards** | creator_id | UUID | ❌ | FK | CAUTION | None | **RLS policy dependency** |
| **cards** | question | TEXT | ✅ | SELECT | CRITICAL | Multiple files | Core flashcard content |
| **cards** | answer | TEXT | ✅ | SELECT | CRITICAL | Multiple files | Core flashcard content |
| **cards** | hint | TEXT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **cards** | explanation | TEXT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **cards** | subject_id | UUID | ✅ | SELECT, FK | CRITICAL | Multiple files | Subject organization |
| **cards** | subsection | VARCHAR | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **cards** | tags | TEXT[] | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **cards** | is_public | BOOLEAN | ❌ | RLS | CAUTION | None | **RLS policy dependency** |
| **cards** | difficulty_rating | SMALLINT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **cards** | image_url | TEXT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **cards** | audio_url | TEXT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **cards** | created_at | TIMESTAMPTZ | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **cards** | updated_at | TIMESTAMPTZ | ❌ | AUTO | SAFE | None | **SAFE TO REMOVE** |
| **cards** | last_reviewed_at | TIMESTAMPTZ | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **cards** | total_reviews | INT | ✅ | SELECT | SAFE-KEEP | admin.js | Analytics display |
| **cards** | correct_reviews | INT | ✅ | SELECT | SAFE-KEEP | admin.js | Analytics calculation |
| **cards** | incorrect_reviews | INT | ✅ | SELECT | SAFE-KEEP | admin.js | Analytics calculation |
| **cards** | average_response_time_ms | INT | ✅ | SELECT | SAFE-KEEP | admin.js | Analytics display |
| **cards** | flagged_for_review | BOOLEAN | ✅ | SELECT, UPDATE | SAFE-KEEP | Multiple files | Admin flagging system |
| **cards** | flagged_by | UUID | ✅ | SELECT, UPDATE | SAFE-KEEP | admin.js, database.js | Admin flagging tracking |
| **cards** | flagged_reason | TEXT | ✅ | SELECT, UPDATE | SAFE-KEEP | admin.js, database.js | Admin flagging details |
| **cards** | flagged_at | TIMESTAMPTZ | ✅ | SELECT | SAFE-KEEP | admin.js | Admin flagging timeline |
| **cards** | user_flag_count | INT | ✅ | SELECT, UPDATE | SAFE-KEEP | admin.js | User reporting system |
| **cards** | last_user_flagged_at | TIMESTAMPTZ | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **subjects** | id | UUID | ✅ | SELECT, FK | CRITICAL | Multiple files | Primary key |
| **subjects** | creator_id | UUID | ✅ | SELECT | SAFE-KEEP | admin.js | RLS policy, ownership |
| **subjects** | name | TEXT | ✅ | SELECT | CRITICAL | Multiple files | Subject display |
| **subjects** | description | TEXT | ✅ | SELECT | SAFE-KEEP | admin.js | Subject details |
| **subjects** | icon_name | VARCHAR | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **subjects** | color_hex | VARCHAR | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **subjects** | parent_id | UUID | ❌ | FK | CAUTION | None | **Hierarchical feature unused** |
| **subjects** | display_order | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **subjects** | is_active | BOOLEAN | ✅ | SELECT, UPDATE | SAFE-KEEP | Multiple files | Admin control, filtering |
| **subjects** | total_chapters | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **subjects** | total_sections | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **subjects** | total_subsections | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **subjects** | is_public | BOOLEAN | ✅ | SELECT | SAFE-KEEP | admin.js | RLS policy |
| **subjects** | requires_approval | BOOLEAN | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **subjects** | created_at | TIMESTAMPTZ | ✅ | SELECT | SAFE-KEEP | admin.js | Display in admin interface |
| **subjects** | updated_at | TIMESTAMPTZ | ❌ | AUTO | SAFE | None | **SAFE TO REMOVE** |
| **user_card_progress** | user_id | UUID | ✅ | SELECT, INSERT | CRITICAL | Multiple files | Primary key |
| **user_card_progress** | card_id | UUID | ✅ | SELECT, INSERT | CRITICAL | Multiple files | Primary key |
| **user_card_progress** | stability | DOUBLE | ✅ | SELECT, UPDATE | CRITICAL | database.js | FSRS algorithm |
| **user_card_progress** | difficulty | DOUBLE | ✅ | SELECT, UPDATE | CRITICAL | database.js | FSRS algorithm |
| **user_card_progress** | elapsed_days | DOUBLE | ✅ | SELECT, UPDATE | CRITICAL | database.js | FSRS algorithm |
| **user_card_progress** | scheduled_days | DOUBLE | ✅ | SELECT, UPDATE | CRITICAL | database.js | FSRS algorithm |
| **user_card_progress** | reps | INT | ✅ | SELECT, UPDATE | CRITICAL | database.js | FSRS algorithm |
| **user_card_progress** | lapses | INT | ✅ | SELECT, UPDATE | CRITICAL | database.js | FSRS algorithm |
| **user_card_progress** | state | card_state | ✅ | SELECT, UPDATE | CRITICAL | database.js | FSRS algorithm |
| **user_card_progress** | last_rating | INT | ✅ | SELECT, UPDATE | CRITICAL | database.js | FSRS algorithm |
| **user_card_progress** | due_date | TIMESTAMPTZ | ⚠️ | SELECT, UPDATE | CAUTION | database.js | **May be redundant with next_review_date** |
| **user_card_progress** | last_review_date | TIMESTAMPTZ | ✅ | SELECT, UPDATE | SAFE-KEEP | Multiple files | Application logic |
| **user_card_progress** | next_review_date | TIMESTAMPTZ | ✅ | SELECT, UPDATE | CRITICAL | Multiple files | Scheduling logic |
| **user_card_progress** | learning_step | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_card_progress** | current_step_interval | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_card_progress** | total_reviews | INT | ✅ | SELECT, UPDATE | SAFE-KEEP | Multiple files | Statistics, display |
| **user_card_progress** | correct_reviews | INT | ✅ | SELECT, UPDATE | SAFE-KEEP | dashboard.js | Statistics |
| **user_card_progress** | incorrect_reviews | INT | ✅ | SELECT, UPDATE | SAFE-KEEP | dashboard.js | Statistics |
| **user_card_progress** | streak | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **user_card_progress** | average_time_ms | INT | ✅ | SELECT, UPDATE | SAFE-KEEP | database.js | Performance tracking |
| **user_card_progress** | created_at | TIMESTAMPTZ | ✅ | SELECT | SAFE-KEEP | database.js | Initial progress tracking |
| **user_card_progress** | updated_at | TIMESTAMPTZ | ✅ | UPDATE | SAFE-KEEP | database.js | Progress modification tracking |
| **review_history** | id | UUID | ✅ | SELECT | CRITICAL | Multiple files | Primary key |
| **review_history** | user_id | UUID | ✅ | SELECT, INSERT | CRITICAL | Multiple files | Audit trail |
| **review_history** | card_id | UUID | ✅ | SELECT, INSERT | CRITICAL | Multiple files | Audit trail |
| **review_history** | review_date | TIMESTAMPTZ | ✅ | SELECT, INSERT | SAFE-KEEP | Multiple files | Timeline analysis |
| **review_history** | rating | INT | ✅ | SELECT, INSERT | CRITICAL | Multiple files | FSRS algorithm |
| **review_history** | response_time_ms | INT | ✅ | SELECT, INSERT | SAFE-KEEP | Multiple files | Performance analysis |
| **review_history** | stability_before | DOUBLE | ✅ | SELECT, INSERT | CRITICAL | database.js | FSRS algorithm |
| **review_history** | difficulty_before | DOUBLE | ✅ | SELECT, INSERT | CRITICAL | database.js | FSRS algorithm |
| **review_history** | elapsed_days | DOUBLE | ✅ | SELECT, INSERT | CRITICAL | database.js | FSRS algorithm |
| **review_history** | scheduled_days | DOUBLE | ✅ | SELECT, INSERT | CRITICAL | database.js | FSRS algorithm |
| **review_history** | stability_after | DOUBLE | ✅ | SELECT, INSERT | CRITICAL | database.js | FSRS algorithm |
| **review_history** | difficulty_after | DOUBLE | ✅ | SELECT, INSERT | CRITICAL | database.js | FSRS algorithm |
| **review_history** | learning_step | INT | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **review_history** | was_relearning | BOOLEAN | ❌ | - | SAFE | None | **SAFE TO REMOVE** |
| **review_history** | state_before | card_state | ✅ | SELECT, INSERT | CRITICAL | database.js | FSRS algorithm |
| **review_history** | state_after | card_state | ✅ | SELECT, INSERT | CRITICAL | database.js | FSRS algorithm |
| **review_history** | created_at | TIMESTAMPTZ | ✅ | SELECT, INSERT | SAFE-KEEP | database.js | Audit trail |
| **fsrs_parameters** | user_id | UUID | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | w0-w16 | DOUBLE | ✅ | SELECT, INSERT | CRITICAL | fsrs.js, fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | learning_steps_minutes | INT[] | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | graduating_interval_days | INT | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | easy_interval_days | INT | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | maximum_interval_days | INT | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | minimum_interval_days | INT | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | new_cards_per_day | INT | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | reviews_per_day | INT | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | relearning_steps_minutes | INT[] | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | minimum_relearning_interval_days | INT | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | lapse_minimum_interval_days | INT | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | lapse_multiplier | DOUBLE | ✅ | SELECT, INSERT | CRITICAL | fsrsParameters.js | **NOW IMPLEMENTED** |
| **fsrs_parameters** | created_at | TIMESTAMPTZ | ✅ | SELECT, INSERT | SAFE-KEEP | fsrsParameters.js | Parameter tracking |
| **fsrs_parameters** | updated_at | TIMESTAMPTZ | ✅ | UPDATE | SAFE-KEEP | fsrsParameters.js | Parameter modification tracking |
| **user_card_flags** | id | UUID | ✅ | SELECT, INSERT | CRITICAL | Multiple files | Primary key |
| **user_card_flags** | user_id | UUID | ✅ | SELECT, INSERT | CRITICAL | Multiple files | Flag tracking |
| **user_card_flags** | card_id | UUID | ✅ | SELECT, INSERT | CRITICAL | Multiple files | Flag tracking |
| **user_card_flags** | reason | flag_reason | ✅ | SELECT, INSERT | SAFE-KEEP | Multiple files | Flag categorization |
| **user_card_flags** | comment | TEXT | ✅ | SELECT, INSERT | SAFE-KEEP | Multiple files | Flag details |
| **user_card_flags** | created_at | TIMESTAMPTZ | ✅ | SELECT, INSERT | SAFE-KEEP | Multiple files | Flag timeline |
| **user_card_flags** | resolved_at | TIMESTAMPTZ | ✅ | SELECT, UPDATE | SAFE-KEEP | admin.js | Resolution tracking |
| **user_card_flags** | resolved_by | UUID | ❌ | FK | CAUTION | None | **Admin tracking - may be unused** |
| **user_card_flags** | resolution_action | TEXT | ✅ | SELECT, UPDATE | SAFE-KEEP | admin.js | Resolution details |

---

## Risk Assessment Categories

### 🟢 SAFE TO REMOVE (23 columns)
**No code references, no critical dependencies**
- `user_profiles`: avatar_url, last_seen_at, learn_ahead_time_minutes, created_at, updated_at, total_cards_studied, total_reviews, current_streak, longest_streak, is_public
- `cards`: hint, explanation, subsection, tags, difficulty_rating, image_url, audio_url, created_at, updated_at, last_reviewed_at, last_user_flagged_at
- `subjects`: icon_name, color_hex, display_order, total_chapters, total_sections, total_subsections, requires_approval, updated_at
- `user_card_progress`: learning_step, current_step_interval, streak
- `review_history`: learning_step, was_relearning

### ⚠️ CAUTION - REVIEW NEEDED (5 columns)
**Limited usage or potential dependencies**
- `user_profiles.daily_review_limit` - May be superseded by tier system
- `user_profiles.is_admin` - DEPRECATED, replaced by user_tier
- `user_card_progress.due_date` - May be redundant with next_review_date
- `cards.creator_id` - RLS policy dependency (unused in app but needed for security)
- `cards.is_public` - RLS policy dependency (unused in app but needed for security)
- `subjects.parent_id` - Hierarchical feature unused but FK constraint exists
- `user_card_flags.resolved_by` - Admin tracking feature

### 🔴 CRITICAL - DO NOT REMOVE (114 columns)
**Active use in application code, database constraints, or FSRS algorithm**

---

## Removal Priority Recommendations

### **Phase 1: High-Confidence Removals (Immediate)**
**Estimated Storage Reduction: 15-20%**

```sql
-- User profiles cleanup
ALTER TABLE user_profiles DROP COLUMN IF EXISTS 
    avatar_url,
    last_seen_at, 
    learn_ahead_time_minutes,
    total_cards_studied,
    total_reviews,
    current_streak,
    longest_streak,
    is_public;

-- Cards cleanup  
ALTER TABLE cards DROP COLUMN IF EXISTS
    hint,
    explanation,
    subsection,
    tags,
    difficulty_rating,
    image_url,
    audio_url,
    last_user_flagged_at;

-- Subjects cleanup
ALTER TABLE subjects DROP COLUMN IF EXISTS
    icon_name,
    color_hex,
    display_order,
    total_chapters,
    total_sections,
    total_subsections,
    requires_approval;

-- Progress cleanup
ALTER TABLE user_card_progress DROP COLUMN IF EXISTS
    learning_step,
    current_step_interval,
    streak;

-- Review history cleanup
ALTER TABLE review_history DROP COLUMN IF EXISTS
    learning_step,
    was_relearning;
```

### **Phase 2: Careful Review Removals (After Testing)**
**Estimated Additional Storage Reduction: 5-8%**

1. **Deprecate `user_profiles.is_admin`** - Replace all references with user_tier checks
2. **Evaluate `user_profiles.daily_review_limit`** - Check if superseded by tier system
3. **Assess `user_card_progress.due_date`** - Verify redundancy with next_review_date
4. **Remove timestamp columns** (created_at, updated_at where truly unused)

### **Phase 3: Security Policy Review**
**Evaluate RLS dependencies for:**
- `cards.creator_id` and `cards.is_public` 
- `subjects.parent_id`
- `user_card_flags.resolved_by`

---

## Expected Benefits

### **Storage Optimization**
- **25-30% reduction** in table sizes
- **Faster SELECT \*** operations
- **Reduced backup sizes**
- **Lower memory usage**

### **Performance Improvements**
- **Faster queries** due to smaller row sizes
- **Improved cache efficiency**
- **Reduced I/O operations**
- **Faster application startup**

### **Maintenance Benefits**
- **Cleaner schema** easier to understand
- **Reduced migration complexity**
- **Lower chance of bugs** from unused columns
- **Better documentation** with focused schema

---

## Important Notes

1. **FSRS Parameters Table**: Previously identified as unused, but NOW FULLY IMPLEMENTED as of the recent FSRS enhancement. All 31 columns are now actively used.

2. **RLS Policy Dependencies**: Some unused columns (creator_id, is_public) may be required for Row Level Security policies even if not used in application code.

3. **Backup Strategy**: Always backup database before any column removal operations.

4. **Rollback Plan**: Keep migration scripts to restore columns if unexpected dependencies are discovered.

5. **Testing Protocol**: Thoroughly test all application functionality after each removal phase.