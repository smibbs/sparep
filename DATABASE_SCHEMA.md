# Database Schema Documentation

## System Overview

This database powers a comprehensive spaced repetition learning platform built with Supabase. The system implements the FSRS (Free Spaced Repetition Scheduler) algorithm for optimized learning intervals and includes advanced features like streak tracking, community-driven card quality control, and multi-tier user management.

### Key Features:
- **Advanced Spaced Repetition**: FSRS algorithm with personalized parameters
- **Community Learning**: Public and private card templates with quality control
- **Streak Gamification**: Daily streak tracking with milestone rewards  
- **Multi-tier Access**: Free, paid, and admin user tiers
- **Performance Optimized**: Extensive indexing and materialized views

## Core Tables

### 1. `profiles` - User Management
User profile information extending Supabase Auth users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, FK to auth.users | User identifier |
| `email` | `varchar` | NOT NULL | User email address |
| `display_name` | `varchar` | NULL | User's display name |
| `user_tier` | `user_tier` | NOT NULL, DEFAULT 'free' | Account tier (free/paid/admin) |
| `is_admin` | `boolean` | NOT NULL, DEFAULT false | Admin status flag |
| `is_public` | `boolean` | NOT NULL, DEFAULT false | Public profile visibility |
| `timezone` | `varchar` | DEFAULT 'UTC' | User's timezone |
| `day_start_time` | `time` | DEFAULT '04:00:00' | When user's day starts |
| `daily_new_cards_limit` | `integer` | NOT NULL, DEFAULT 20, CHECK >= 0 | Daily new cards limit |
| `daily_review_limit` | `integer` | NOT NULL, DEFAULT 100, CHECK >= 0 | Daily review limit |
| `reviews_today` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Reviews completed today |
| `last_review_date` | `date` | DEFAULT CURRENT_DATE | Last review session date |
| `current_daily_streak` | `integer` | DEFAULT 0, CHECK >= 0 | Current streak count |
| `longest_daily_streak` | `integer` | DEFAULT 0, CHECK >= 0 | Longest streak achieved |
| `last_streak_date` | `date` | NULL | Last streak activity date |
| `streak_freeze_count` | `integer` | DEFAULT 0, CHECK >= 0 | Available streak freezes |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Account creation time |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last profile update |

### 2. `subjects` - Learning Categories
Hierarchical categorization system for organizing learning content.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT gen_random_uuid() | Subject identifier |
| `name` | `varchar` | NOT NULL, CHECK length(trim(name)) > 0 | Subject name |
| `description` | `text` | NULL | Subject description |
| `parent_id` | `uuid` | NULL, FK to subjects.id | Parent subject (hierarchy) |
| `creator_id` | `uuid` | NULL, FK to auth.users | Subject creator |
| `is_public` | `boolean` | NOT NULL, DEFAULT false | Public visibility |
| `is_active` | `boolean` | NOT NULL, DEFAULT true | Active status |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last update time |

### 3. `decks` - Study Collections
User-created collections of cards with personalized settings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT gen_random_uuid() | Deck identifier |
| `name` | `varchar` | NOT NULL, CHECK length(trim(name)) > 0 | Deck name |
| `description` | `text` | NULL | Deck description |
| `user_id` | `uuid` | NOT NULL, FK to auth.users | Deck owner |
| `daily_new_cards_limit` | `integer` | NULL, CHECK >= 0 | Deck-specific new card limit |
| `daily_review_limit` | `integer` | NULL, CHECK >= 0 | Deck-specific review limit |
| `desired_retention` | `numeric` | NULL, CHECK > 0 AND <= 1 | Target retention rate |
| `learning_steps_minutes` | `integer[]` | NULL | Learning step intervals |
| `graduating_interval_days` | `integer` | NULL, CHECK > 0 | Graduation interval |
| `easy_interval_days` | `integer` | NULL, CHECK > 0 | Easy button interval |
| `maximum_interval_days` | `integer` | NULL, CHECK > 0 | Maximum interval cap |
| `is_active` | `boolean` | NOT NULL, DEFAULT true | Active status |
| `is_public` | `boolean` | NOT NULL, DEFAULT false | Public sharing |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last update time |

### 4. `card_templates` - Flashcard Content
Template definitions for flashcards with community features.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT gen_random_uuid() | Template identifier |
| `question` | `text` | NOT NULL, CHECK length(trim(question)) > 0 | Card front content |
| `answer` | `text` | NOT NULL, CHECK length(trim(answer)) > 0 | Card back content |
| `subject_id` | `uuid` | NULL, FK to subjects.id | Associated subject |
| `subsection` | `varchar` | NULL | Subject subsection (legacy) |
| `path` | `ltree` | NULL | Hierarchical path (e.g., 1.7.2.1 = Book 1, Section 7, Subsection 2, Item 1) |
| `tags` | `text[]` | NULL | Search/organization tags |
| `creator_id` | `uuid` | NULL, FK to auth.users | Template creator |
| `is_public` | `boolean` | NOT NULL, DEFAULT false | Public availability |
| `flagged_for_review` | `boolean` | NOT NULL, DEFAULT false | Quality control flag |
| `flagged_by` | `uuid` | NULL, FK to auth.users | Admin who flagged |
| `flagged_reason` | `text` | NULL | Flagging reason |
| `flagged_at` | `timestamptz` | NULL | Flagging timestamp |
| `user_flag_count` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Community flag count |
| `total_reviews` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Total review count |
| `correct_reviews` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Correct answers |
| `incorrect_reviews` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Incorrect answers |
| `average_response_time_ms` | `integer` | NULL, CHECK >= 0 | Average response time |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last update time |

### 5. `user_cards` - Individual Card Progress
Personalized card instances with FSRS scheduling data.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | `uuid` | PRIMARY KEY, FK to auth.users | Card owner |
| `card_template_id` | `uuid` | PRIMARY KEY, FK to card_templates.id | Template reference |
| `deck_id` | `uuid` | PRIMARY KEY, FK to decks.id | Assigned deck |
| `state` | `card_state` | NOT NULL, DEFAULT 'new' | Learning state |
| `stability` | `numeric` | NOT NULL, DEFAULT 0.0000, CHECK >= 0 | FSRS stability |
| `difficulty` | `numeric` | NOT NULL, DEFAULT 5.0000, CHECK 1-10 | FSRS difficulty |
| `due_at` | `timestamptz` | NULL | Next review time |
| `last_reviewed_at` | `timestamptz` | NULL | Last review time |
| `elapsed_days` | `numeric` | NOT NULL, DEFAULT 0.0000, CHECK >= 0 | Days since last review |
| `scheduled_days` | `numeric` | NOT NULL, DEFAULT 0.0000, CHECK >= 0 | Scheduled interval |
| `reps` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Total repetitions |
| `lapses` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Failure count |
| `last_rating` | `integer` | NULL, CHECK 0-3 | Last button pressed |
| `total_reviews` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Review count |
| `correct_reviews` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Correct count |
| `incorrect_reviews` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Incorrect count |
| `average_response_time_ms` | `integer` | NULL, CHECK >= 0 | Response time |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last update time |

### 6. `reviews` - Learning History
Complete audit trail of all review sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT gen_random_uuid() | Review identifier |
| `user_id` | `uuid` | NOT NULL, FK to auth.users | Reviewer |
| `card_template_id` | `uuid` | NOT NULL, FK to card_templates.id | Reviewed card |
| `deck_id` | `uuid` | NOT NULL, FK to decks.id | Source deck |
| `reviewed_at` | `timestamptz` | NOT NULL, DEFAULT now() | Review timestamp |
| `response_time_ms` | `integer` | NOT NULL, CHECK > 0 | Response time |
| `rating` | `integer` | NOT NULL, CHECK 0-3 | User rating (0=again, 3=easy) |
| `state_before` | `card_state` | NOT NULL | Pre-review state |
| `stability_before` | `numeric` | NOT NULL, CHECK >= 0 | Pre-review stability |
| `difficulty_before` | `numeric` | NOT NULL, CHECK 1-10 | Pre-review difficulty |
| `due_at_before` | `timestamptz` | NULL | Pre-review due time |
| `state_after` | `card_state` | NOT NULL | Post-review state |
| `stability_after` | `numeric` | NOT NULL, CHECK >= 0 | Post-review stability |
| `difficulty_after` | `numeric` | NOT NULL, CHECK 1-10 | Post-review difficulty |
| `due_at_after` | `timestamptz` | NULL | Post-review due time |
| `elapsed_days` | `numeric` | NOT NULL, CHECK >= 0 | Days elapsed |
| `scheduled_days` | `numeric` | NOT NULL, CHECK >= 0 | New interval |
| `reps_before` | `integer` | NOT NULL, CHECK >= 0 | Pre-review reps |
| `lapses_before` | `integer` | NOT NULL, CHECK >= 0 | Pre-review lapses |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation time |

### 7. `fsrs_params` - Algorithm Configuration
FSRS algorithm parameters per user for personalized scheduling.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | `uuid` | PRIMARY KEY, FK to auth.users | Parameter owner |
| `weights` | `jsonb` | NOT NULL, DEFAULT {...} | FSRS weight parameters |
| `learning_steps_minutes` | `integer[]` | NOT NULL, DEFAULT [1, 10] | Learning intervals |
| `graduating_interval_days` | `integer` | NOT NULL, DEFAULT 1, CHECK > 0 | Graduation interval |
| `easy_interval_days` | `integer` | NOT NULL, DEFAULT 4, CHECK > 0 | Easy interval |
| `maximum_interval_days` | `integer` | NOT NULL, DEFAULT 36500, CHECK > 0 | Maximum interval |
| `minimum_interval_days` | `integer` | NOT NULL, DEFAULT 1, CHECK > 0 | Minimum interval |
| `new_cards_per_day` | `integer` | NULL, CHECK >= 0 | Daily new card limit |
| `reviews_per_day` | `integer` | NULL, CHECK >= 0 | Daily review limit |
| `relearning_steps_minutes` | `integer[]` | NOT NULL, DEFAULT [10] | Relearning steps |
| `minimum_relearning_interval_days` | `integer` | NOT NULL, DEFAULT 1, CHECK > 0 | Min relearning interval |
| `lapse_minimum_interval_days` | `integer` | NOT NULL, DEFAULT 1, CHECK > 0 | Lapse interval |
| `lapse_multiplier` | `numeric` | NOT NULL, DEFAULT 0.500, CHECK > 0 AND <= 1 | Lapse multiplier |
| `desired_retention` | `numeric` | NOT NULL, DEFAULT 0.900, CHECK > 0 AND <= 1 | Target retention |
| `optimization_count` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Optimization runs |
| `last_optimization_at` | `timestamptz` | NULL | Last optimization |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last update time |

### 8. `user_card_flags` - Quality Control
Community-driven card quality reporting system.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT gen_random_uuid() | Flag identifier |
| `user_id` | `uuid` | NOT NULL, FK to auth.users | Reporting user |
| `card_template_id` | `uuid` | NOT NULL, FK to card_templates.id | Flagged card |
| `reason` | `flag_reason` | NOT NULL | Flag category |
| `comment` | `text` | NULL, CHECK length(trim()) > 0 | Additional details |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Flag creation |
| `resolved_at` | `timestamptz` | NULL | Resolution time |
| `resolved_by` | `uuid` | NULL, FK to auth.users | Resolving admin |
| `resolution_action` | `text` | NULL, CHECK IN (...) | Action taken |
| `resolution_comment` | `text` | NULL | Resolution details |

### 9. `streak_reward_configs` - Gamification Setup
Configurable streak milestone rewards for user engagement.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT gen_random_uuid() | Config identifier |
| `milestone_days` | `integer` | NOT NULL, UNIQUE, CHECK > 0 | Streak threshold |
| `reward_type` | `text` | NOT NULL, CHECK length(trim()) > 0 | Reward category |
| `reward_title` | `text` | NOT NULL, CHECK length(trim()) > 0 | Display title |
| `reward_description` | `text` | NOT NULL, CHECK length(trim()) > 0 | Reward details |
| `reward_value` | `integer` | NULL, CHECK >= 0 | Reward amount |
| `is_active` | `boolean` | NOT NULL, DEFAULT true | Active status |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last update time |

### 10. `user_streak_milestones` - Achievement Tracking
Individual user milestone achievements and reward claims.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT gen_random_uuid() | Milestone identifier |
| `user_id` | `uuid` | NOT NULL, FK to auth.users | Achievement owner |
| `milestone_days` | `integer` | NOT NULL, CHECK > 0 | Days achieved |
| `achieved_at` | `timestamptz` | NOT NULL, DEFAULT now() | Achievement time |
| `reward_claimed` | `boolean` | NOT NULL, DEFAULT false | Claim status |
| `reward_claimed_at` | `timestamptz` | NULL | Claim timestamp |
| `reward_type` | `text` | NULL | Reward category |
| `reward_description` | `text` | NULL | Reward details |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation time |

### 11. `user_streak_history` - Daily Activity Log
Daily streak activity tracking for analytics and verification.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT gen_random_uuid() | History identifier |
| `user_id` | `uuid` | NOT NULL, FK to auth.users | Activity owner |
| `streak_date` | `date` | NOT NULL | Activity date |
| `cards_reviewed` | `integer` | NOT NULL, DEFAULT 0, CHECK >= 0 | Cards reviewed |
| `streak_day_number` | `integer` | NOT NULL, CHECK >= 0 | Streak position |
| `is_streak_break` | `boolean` | NOT NULL, DEFAULT false | Break indicator |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation time |

**Unique Constraint**: `(user_id, streak_date)` - One record per user per day

### 12. `loading_messages` - UI Enhancement
Dynamic loading messages for improved user experience.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT gen_random_uuid() | Message identifier |
| `message` | `text` | NOT NULL, CHECK length(trim()) > 0 | Display text |
| `is_active` | `boolean` | NOT NULL, DEFAULT true | Active status |
| `weight` | `integer` | NOT NULL, DEFAULT 1, CHECK > 0 | Selection probability |
| `category` | `text` | NULL, CHECK length(trim()) > 0 | Message category |
| `show_on_study` | `boolean` | DEFAULT true | Study screen display |
| `show_on_review` | `boolean` | DEFAULT true | Review screen display |
| `show_on_new_cards` | `boolean` | DEFAULT true | New cards display |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT now() | Creation time |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT now() | Last update time |

## Hierarchical Path System

The `card_templates.path` column uses PostgreSQL's LTREE type for efficient hierarchical categorization based on book sections.

### Path Format Examples:
- `1` = Book 1
- `1.7` = Book 1, Section 7 (Firearms and Gun Crime)
- `1.7.2` = Book 1, Section 7, Subsection 2 (Definitions)  
- `1.7.2.1` = Book 1, Section 7, Subsection 2, Item 1 (Firearm Definition)

### Common Query Patterns:
```sql
-- Get all cards in firearms section (1.7) and subsections
SELECT * FROM card_templates WHERE path <@ '1.7'::ltree;

-- Get cards exactly at section level (depth 2)  
SELECT * FROM card_templates WHERE nlevel(path) = 2;

-- Get all definition cards (1.7.2.*)
SELECT * FROM card_templates WHERE path ~ '1.7.2.*'::lquery;

-- Get hierarchy info for a path
SELECT * FROM get_path_hierarchy_info('1.7.2.1'::ltree);
```

### Migration Strategy:
- **Subjects**: Use 2-level hierarchy (e.g., `1.7` = "Firearms and Gun Crime")
- **Cards**: Full hierarchy in `path` column (e.g., `1.7.2.1`)
- **Legacy**: `subsection` VARCHAR preserved for backward compatibility
- **Population**: Use `migrate_subsection_to_path()` to convert existing data

## Custom Types & Enums

### `card_state` Enum
Represents the learning state of a card in the FSRS algorithm:
- `new`: Never studied
- `learning`: In initial learning phase
- `review`: In long-term review cycle  
- `relearning`: Failed review, back to learning
- `buried`: Temporarily hidden
- `suspended`: User-disabled

### `user_tier` Enum
Defines user access levels:
- `free`: Basic access with limitations
- `paid`: Premium features unlocked
- `admin`: Full system access

### `flag_reason` Enum
Categorizes card quality issues:
- `incorrect`: Factually wrong content
- `spelling`: Typography/spelling errors
- `confusing`: Unclear or ambiguous
- `other`: Miscellaneous issues

## Table Relationships & Dependencies

### Core User Flow:
```
auth.users → profiles → fsrs_params
           → decks → user_cards ← card_templates ← subjects
           → reviews (audit trail)
```

### Community Features:
```
users → card_templates (creation)
      → user_card_flags (quality control)
      → subjects (organization)
```

### Gamification System:
```
users → user_streak_history → user_streak_milestones ← streak_reward_configs
```

### Key Foreign Key Relationships:
- `profiles.id` → `auth.users.id` (1:1)
- `subjects.parent_id` → `subjects.id` (hierarchical)
- `decks.user_id` → `auth.users.id` (1:many)
- `card_templates.subject_id` → `subjects.id` (many:1)
- `user_cards` has composite FK to `(user_id, card_template_id, deck_id)`
- `reviews` tracks all card interactions with full audit trail

## Row Level Security (RLS) Policies

All tables have RLS enabled with comprehensive security policies:

### `profiles` Table (4 policies)
- **Users can insert their own profile**: `INSERT` where `auth.uid() = id`
- **Users can update their own profile**: `UPDATE` where `auth.uid() = id`  
- **Users can view their own profile**: `SELECT` where `auth.uid() = id`
- **Admins can view all profiles**: `ALL` where `is_admin()`

### `subjects` Table (6 policies)
- **Public subjects are viewable by all**: `SELECT` where `is_public = true AND is_active = true`
- **Users can view their own subjects**: `SELECT` where `auth.uid() = creator_id`
- **Users can create subjects**: `INSERT` where `auth.uid() = creator_id`
- **Users can update their own subjects**: `UPDATE` where `auth.uid() = creator_id`
- **Users can delete their own subjects**: `DELETE` where `auth.uid() = creator_id`
- **Admins can manage all subjects**: `ALL` where admin check

### `decks` Table (3 policies)
- **Users can view public decks**: `SELECT` where `is_public = true`
- **Users can access public deck study data**: `SELECT` for study sessions
- **Admins can manage all decks**: `ALL` where admin check

### `card_templates` Table (6 policies)
- **Public unflagged cards are viewable by all**: `SELECT` where `is_public = true AND flagged_for_review = false`
- **Users can view their own cards**: `SELECT` where `auth.uid() = creator_id`
- **Users can create cards**: `INSERT` where `auth.uid() = creator_id`
- **Users can update their own unflagged cards**: `UPDATE` with restrictions
- **Users can delete their own unflagged cards**: `DELETE` with restrictions
- **Admins can manage all cards**: `ALL` where admin check

### `user_cards` Table (5 policies)
- **Users can view their own cards**: `SELECT` where `auth.uid() = user_id`
- **Users can create their own cards**: `INSERT` where `auth.uid() = user_id`
- **Users can update their own cards**: `UPDATE` where `auth.uid() = user_id`
- **Users can delete their own cards**: `DELETE` where `auth.uid() = user_id`
- **Admins can view all user cards**: `SELECT` where admin check

### `reviews` Table (3 policies)
- **Users can view their own reviews**: `SELECT` where `auth.uid() = user_id`
- **Users can insert their own reviews**: `INSERT` where `auth.uid() = user_id`
- **Admins can view all reviews**: `SELECT` where admin check

### `fsrs_params` Table (5 policies)
- **Users can view their own FSRS parameters**: `SELECT` where `auth.uid() = user_id`
- **Users can insert their own FSRS parameters**: `INSERT` where `auth.uid() = user_id`
- **Users can update their own FSRS parameters**: `UPDATE` where `auth.uid() = user_id`
- **Users can delete their own FSRS parameters**: `DELETE` where `auth.uid() = user_id`
- **Admins can view all FSRS parameters**: `SELECT` where admin check

### `user_card_flags` Table (6 policies)
- **Users can view their own flags**: `SELECT` where `auth.uid() = user_id`
- **Users can create flags**: `INSERT` where `auth.uid() = user_id`
- **Users can update their own unresolved flags**: `UPDATE` with conditions
- **Users can delete their own unresolved flags**: `DELETE` with conditions
- **Admins can view all flags**: `SELECT` where admin check
- **Admins can resolve flags**: `UPDATE` where admin check

### Streak & Reward Tables (8 policies)
- **Users can view their own milestones**: Individual access control
- **Users can update their own milestone claims**: Claim management
- **Users can view/insert/update their own streak history**: Activity tracking
- **Admins have full access**: Complete management capabilities
- **Anyone can view active configs**: Public reward information

### `loading_messages` Table (2 policies)
- **Anyone can view active loading messages**: `SELECT` where `is_active = true`
- **Admins can manage all loading messages**: `ALL` where admin check

## Views

### 1. `v_due_counts_by_deck`
Performance-optimized view aggregating card counts by deck and user:
- Counts by state (new, learning, review, etc.)
- Due card calculations with real-time filtering
- Deck metadata integration
- Excludes flagged cards from counts

### 2. `v_due_user_cards`
Ready-to-study cards with complete metadata:
- Due cards requiring review (learning, review, relearning states)
- Includes question/answer content and metadata
- Subject and deck information
- Overdue calculation in seconds
- Filters out inactive decks and flagged cards

### 3. `v_new_user_cards`
New cards available for initial learning:
- Cards in 'new' state
- Complete card content and metadata
- Subject and deck association
- Creation timestamp for ordering
- Active deck and unflagged card filtering

### 4. `v_user_study_session_info`
Comprehensive user study session data:
- User profile and preferences
- FSRS configuration parameters
- Current streak and gamification status
- Real-time new and due card counts
- Timezone and scheduling preferences

## Functions

### Admin Functions (12 functions)
- `is_admin()`: Check admin status for current user
- `verify_admin_access()`: Server-side admin verification
- `verify_admin_access_with_session_check()`: Enhanced admin verification
- `validate_active_admin_session()`: Periodic session validation
- `admin_toggle_subject_status()`: Toggle subject active status
- `admin_bulk_toggle_subjects()`: Bulk subject management
- `admin_flag_card()`: Flag cards for review
- `admin_unflag_card()`: Remove card flags
- `get_database_stats()`: System statistics
- `verify_database_integrity()`: Data integrity checks
- `get_flagged_cards_for_admin()`: Flagged card management
- `can_access_flagged_cards()`: Flag access control

### User Management Functions (8 functions)
- `handle_new_user()`: New user setup trigger
- `create_default_deck_for_user()`: Initialize user deck
- `create_fsrs_params_for_new_user()`: Setup FSRS parameters  
- `create_default_fsrs_params()`: Initialize FSRS configuration
- `get_user_tier()`: Retrieve user access level
- `get_user_local_time()`: Timezone-aware time calculation
- `is_new_day_for_user()`: Daily reset detection
- `reset_daily_counters()`: Daily maintenance task

### FSRS Algorithm Functions (8 functions)
- `get_fsrs_config()`: Retrieve user FSRS settings
- `get_fsrs_weight()`: Get specific FSRS weight
- `update_fsrs_weight()`: Update individual weight
- `update_fsrs_weights()`: Bulk weight update
- `validate_fsrs_weights()`: Weight validation
- `get_effective_daily_limits()`: Calculate daily limits
- `get_deck_daily_limits()`: Deck-specific limits
- `process_card_review()`: Complete review processing

### Card & Study Functions (21 functions)
- `get_new_cards_for_user()`: Fetch new cards for study
- `get_due_cards_for_user()`: Fetch cards for review
- `add_card_to_deck()`: Add template to user deck
- `has_card_access()`: Card access validation
- `has_subject_access()`: Subject access validation  
- `update_card_after_review()`: Update card post-review
- `record_review()`: Store review in audit trail
- `get_card_review_history()`: Card performance history
- `get_recent_review_activity()`: Recent user activity
- `get_user_review_stats()`: User performance analytics
- `update_card_template_stats()`: Template performance updates
- `search_card_templates()`: Full-text card search
- `get_card_counts_by_deck()`: Deck statistics
- `initialize_card_progress()`: Setup new card progress
- `increment_daily_reviews()`: Update daily counter
- `search_cards_by_path()`: Hierarchical path-based card search
- `get_cards_by_depth()`: Cards at specific hierarchy depth
- `validate_book_path()`: Path format validation
- `convert_to_book_path()`: String to LTREE conversion
- `get_path_hierarchy_info()`: Path structure analysis
- `migrate_subsection_to_path()`: Legacy data migration

### Streak & Gamification Functions (8 functions)
- `update_user_streak()`: Process streak updates
- `update_user_daily_streak()`: Daily streak calculation
- `check_and_award_streak_milestones()`: Milestone detection
- `claim_streak_milestone_reward()`: Process reward claims
- `claim_streak_reward()`: Legacy reward claiming
- `get_unclaimed_streak_rewards()`: Available rewards
- `trigger_update_user_streak()`: Review-triggered updates

### Card Flagging Functions (6 functions)
- `flag_card_for_review()`: Submit card quality issues
- `submit_user_card_flag()`: User flag submission
- `resolve_card_flag()`: Admin flag resolution
- `resolve_user_card_flag()`: Enhanced flag resolution
- `update_card_flag_count()`: Maintain flag counters

### UI & UX Functions (5 functions)
- `get_random_loading_message()`: Single message selection
- `get_random_loading_messages()`: Multiple message selection
- `add_loading_message()`: Admin message management

### Utility Functions (8 functions)
- `gen_secure_uuid()`: Secure UUID generation
- `set_updated_at()`: Auto-update timestamp trigger
- `update_updated_at_column()`: Generic timestamp updater
- `update_loading_messages_updated_at()`: Message timestamp
- `get_difficulty_consistency_analytics()`: Performance analytics
- `get_failed_attempts_before_good_rating()`: Learning analytics

## Triggers

### Automatic Timestamp Updates (8 triggers)
- `profiles_updated_at`: Update profiles.updated_at on changes
- `subjects_updated_at`: Update subjects.updated_at on changes
- `decks_updated_at`: Update decks.updated_at on changes
- `card_templates_updated_at`: Update card_templates.updated_at on changes
- `user_cards_updated_at`: Update user_cards.updated_at on changes
- `fsrs_params_updated_at`: Update fsrs_params.updated_at on changes
- `streak_reward_configs_updated_at`: Update streak_reward_configs.updated_at on changes
- `loading_messages_updated_at`: Update loading_messages.updated_at on changes

### Business Logic Triggers (4 triggers)
- `create_fsrs_params_on_profile_insert`: Auto-create FSRS params for new users
- `update_streak_on_review`: Update user streak after review submission
- `update_flag_count_on_insert`: Increment flag count when flag created
- `update_flag_count_on_delete`: Decrement flag count when flag removed

## Indexes

### Performance-Critical Indexes

#### `user_cards` - Heavily Optimized (12 indexes)
- `idx_user_cards_user_state_due`: Optimized due card queries
- `idx_user_cards_user_deck_state_due`: Deck-specific due cards  
- `idx_user_cards_user_state_created`: New card ordering
- `idx_user_cards_user_deck_state`: Deck statistics
- `idx_user_cards_user_due`: Global due card lookup
- Plus standard foreign key and state indexes

#### `reviews` - Analytics Focused (10 indexes)  
- `idx_reviews_user_date_desc`: Recent activity queries
- `idx_reviews_user_card_reviewed_at`: Card history lookup
- `idx_reviews_user_rating_date`: Performance analytics
- `idx_reviews_user_card_deck`: Multi-dimensional analysis
- Plus standard foreign key indexes

#### `card_templates` - Search Optimized (13 indexes)
- `idx_card_templates_question_fts`: Full-text search on questions
- `idx_card_templates_answer_fts`: Full-text search on answers
- `idx_card_templates_public_unflagged`: Optimized public access
- `idx_card_templates_tags`: Tag-based filtering (GIN index)
- `idx_card_templates_path_gist`: Hierarchical path queries (GiST index)
- `idx_card_templates_path_btree`: Exact path matches and sorting
- `idx_card_templates_subject_path`: Combined subject and path queries
- `idx_card_templates_public_path`: Public cards with path filtering
- Plus standard foreign key and status indexes

#### Other Key Indexes
- **Streak tracking**: User/date combinations for performance
- **FSRS parameters**: Weight JSON optimization with GIN
- **Flag management**: Unresolved flag queries  
- **Loading messages**: Context-based selection optimization

## Security & Access Control

### Multi-Layer Security Model

#### 1. Authentication Layer
- Supabase Auth integration with `auth.users` table
- JWT-based session management
- Secure UUID generation for all entities

#### 2. Authorization Layer (RLS)
- **47 comprehensive RLS policies** covering all data access patterns
- **User isolation**: Users can only access their own data
- **Public content**: Controlled access to community content
- **Admin privileges**: Elevated access for system management
- **Quality control**: Flagged content restrictions

#### 3. Data Validation
- **Check constraints** on all numeric ranges and text content
- **Foreign key constraints** ensuring referential integrity  
- **Enum types** restricting values to valid options
- **Trigger-based validation** for complex business rules

#### 4. Admin Functions
- **Secure admin verification**: Multiple validation layers
- **Session freshness checks**: Prevent stale admin sessions
- **Audit trails**: Complete review history tracking
- **Flag resolution system**: Community quality control

### Access Patterns

#### Public Data Access
- Public card templates (unflagged only)
- Public subjects (active only)  
- Active loading messages
- Streak reward configurations

#### User Private Data
- Personal profiles and preferences
- Individual card progress and statistics
- Review history and performance analytics
- FSRS parameters and deck configurations
- Streak history and milestone achievements

#### Admin Privileged Access  
- System-wide statistics and analytics
- Flagged content management
- User administration capabilities
- Database integrity verification

### Performance Considerations

#### Query Optimization
- **67 strategic indexes** covering all major query patterns
- **4 materialized views** for complex aggregations
- **Composite indexes** for multi-column lookups
- **Partial indexes** for filtered queries

#### Scalability Features
- **Horizontal partitioning ready**: Date-based partitioning potential for reviews
- **Connection pooling friendly**: Read-heavy workload optimization
- **Caching integration**: View-based data suitable for external caching
- **Background job support**: Daily maintenance and analytics processing

This database schema supports a sophisticated spaced repetition learning platform with enterprise-grade security, performance optimization, and comprehensive feature set including community contributions, gamification, and advanced learning algorithms.