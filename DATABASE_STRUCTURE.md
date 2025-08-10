# FSRS Database Structure Documentation

## Overview

Your database has been completely restructured with a modern FSRS (Free Spaced Repetition System) implementation. This document provides a comprehensive overview of all tables, their relationships, and interdependencies.

## Database Statistics

- **Total Tables**: 11 core tables
- **Total Views**: 4 optimized views 
- **ENUM Types**: 3 custom enums
- **Primary Features**: Modern FSRS, Deck-based organization, Timezone support, Immutable review history

---

## ENUM Types

### 1. `user_tier`
**Values**: `free`, `paid`, `admin`
**Purpose**: Controls user access levels and feature availability

### 2. `card_state` 
**Values**: `new`, `learning`, `review`, `relearning`, `buried`, `suspended`
**Purpose**: FSRS card learning states (standardized FSRS states)

### 3. `flag_reason`
**Values**: `incorrect`, `spelling`, `confusing`, `other`
**Purpose**: User flag reasons for reporting card issues

---

## Core Tables

### 1. `profiles` 
**Purpose**: Enhanced user profiles with timezone and daily scheduling support

#### Key Columns:
```sql
id                    UUID PRIMARY KEY → auth.users(id)
email                 VARCHAR NOT NULL
display_name          VARCHAR
user_tier             user_tier DEFAULT 'free'
is_admin              BOOLEAN DEFAULT FALSE
timezone              VARCHAR DEFAULT 'UTC'
day_start_time        TIME DEFAULT '04:00:00'
daily_new_cards_limit INTEGER DEFAULT 20
daily_review_limit    INTEGER DEFAULT 100
reviews_today         INTEGER DEFAULT 0
last_review_date      DATE DEFAULT CURRENT_DATE
current_daily_streak  INTEGER DEFAULT 0
longest_daily_streak  INTEGER DEFAULT 0
last_streak_date      DATE
streak_freeze_count   INTEGER DEFAULT 0
created_at           TIMESTAMPTZ DEFAULT NOW()
updated_at           TIMESTAMPTZ DEFAULT NOW()
```

#### Key Features:
- Timezone-aware scheduling
- Daily activity tracking
- Streak management
- Configurable daily limits

---

### 2. `subjects`
**Purpose**: Subject organization with hierarchical support

#### Key Columns:
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
name         VARCHAR NOT NULL
description  TEXT
parent_id    UUID → subjects(id) -- Allows hierarchy
creator_id   UUID → auth.users(id)
is_public    BOOLEAN DEFAULT FALSE
is_active    BOOLEAN DEFAULT TRUE
created_at   TIMESTAMPTZ DEFAULT NOW()
updated_at   TIMESTAMPTZ DEFAULT NOW()
```

#### Key Features:
- Hierarchical organization (parent-child relationships)
- Public/private visibility
- Creator ownership

---

### 3. `decks`
**Purpose**: Deck-based learning system with individual settings

#### Key Columns:
```sql
id                        UUID PRIMARY KEY DEFAULT gen_random_uuid()
name                      VARCHAR NOT NULL
description               TEXT
user_id                   UUID NOT NULL → auth.users(id)
daily_new_cards_limit     INTEGER -- NULL = inherit from profile
daily_review_limit        INTEGER -- NULL = inherit from profile
desired_retention         DECIMAL(3,2) -- FSRS parameter override
learning_steps_minutes    INTEGER[] -- Learning configuration
graduating_interval_days  INTEGER
easy_interval_days        INTEGER
maximum_interval_days     INTEGER
is_active                 BOOLEAN DEFAULT TRUE
created_at                TIMESTAMPTZ DEFAULT NOW()
updated_at                TIMESTAMPTZ DEFAULT NOW()
```

#### Key Features:
- Per-deck customization
- FSRS parameter overrides
- Configurable learning steps
- Daily limit overrides

---

### 4. `card_templates`
**Purpose**: Shared card content separate from user progress

#### Key Columns:
```sql
id                       UUID PRIMARY KEY DEFAULT gen_random_uuid()
question                 TEXT NOT NULL
answer                   TEXT NOT NULL
subject_id               UUID → subjects(id)
subsection               VARCHAR -- Hierarchical location (e.g., "2.15.3")
tags                     TEXT[] -- Flexible tagging system
creator_id               UUID → auth.users(id)
is_public                BOOLEAN DEFAULT FALSE
flagged_for_review       BOOLEAN DEFAULT FALSE -- Admin moderation
flagged_by               UUID → auth.users(id)
flagged_reason           TEXT
flagged_at               TIMESTAMPTZ
user_flag_count          INTEGER DEFAULT 0 -- User report tracking
total_reviews            INTEGER DEFAULT 0 -- Global statistics
correct_reviews          INTEGER DEFAULT 0
incorrect_reviews        INTEGER DEFAULT 0
average_response_time_ms INTEGER DEFAULT 0
created_at               TIMESTAMPTZ DEFAULT NOW()
updated_at               TIMESTAMPTZ DEFAULT NOW()
```

#### Key Features:
- Shared content model
- Admin flagging system
- Global statistics tracking
- Flexible tagging
- Full-text search support

---

### 5. `user_cards`
**Purpose**: Individual user progress tracking with FSRS state

#### Key Columns:
```sql
PRIMARY KEY (user_id, card_template_id, deck_id)

user_id                  UUID NOT NULL → auth.users(id)
card_template_id         UUID NOT NULL → card_templates(id)
deck_id                  UUID NOT NULL → decks(id)
state                    card_state DEFAULT 'new'
stability                DECIMAL(10,4) DEFAULT 0.0000 -- FSRS algorithm state
difficulty               DECIMAL(10,4) DEFAULT 5.0000 -- FSRS algorithm state
due_at                   TIMESTAMPTZ -- When next review is due
last_reviewed_at         TIMESTAMPTZ
elapsed_days             DECIMAL(10,4) DEFAULT 0.0000
scheduled_days           DECIMAL(10,4) DEFAULT 0.0000
reps                     INTEGER DEFAULT 0 -- Total repetitions
lapses                   INTEGER DEFAULT 0 -- Number of failures
last_rating              INTEGER -- 0=Again, 1=Hard, 2=Good, 3=Easy
total_reviews            INTEGER DEFAULT 0 -- Individual statistics
correct_reviews          INTEGER DEFAULT 0
incorrect_reviews        INTEGER DEFAULT 0
average_response_time_ms INTEGER DEFAULT 0
created_at               TIMESTAMPTZ DEFAULT NOW()
updated_at               TIMESTAMPTZ DEFAULT NOW()
```

#### Key Features:
- Composite primary key (user, card, deck)
- Complete FSRS algorithm state
- 0-3 rating scale (modern FSRS)
- Individual progress tracking
- Multiple cards per template per user (different decks)

---

### 6. `reviews`
**Purpose**: Immutable review history for FSRS calculations and analytics

#### Key Columns:
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id             UUID NOT NULL → auth.users(id)
card_template_id    UUID NOT NULL → card_templates(id)
deck_id             UUID NOT NULL → decks(id)
reviewed_at         TIMESTAMPTZ DEFAULT NOW()
response_time_ms    INTEGER NOT NULL
rating              INTEGER NOT NULL -- 0-3 FSRS scale
state_before        card_state NOT NULL
stability_before    DECIMAL(10,4) NOT NULL
difficulty_before   DECIMAL(10,4) NOT NULL
due_at_before       TIMESTAMPTZ
state_after         card_state NOT NULL
stability_after     DECIMAL(10,4) NOT NULL
difficulty_after    DECIMAL(10,4) NOT NULL
due_at_after        TIMESTAMPTZ
elapsed_days        DECIMAL(10,4) NOT NULL -- Days since last review
scheduled_days      DECIMAL(10,4) NOT NULL -- Planned interval
reps_before         INTEGER NOT NULL
lapses_before       INTEGER NOT NULL
created_at          TIMESTAMPTZ DEFAULT NOW() -- Immutable
```

#### Key Features:
- **Immutable records** (no UPDATE/DELETE policies)
- Complete before/after state tracking
- FSRS calculation data
- Analytics foundation
- Performance metrics

---

### 7. `fsrs_params`
**Purpose**: Modern JSONB FSRS parameter storage for flexible optimization

#### Key Columns:
```sql
user_id                          UUID PRIMARY KEY → auth.users(id)
weights                          JSONB NOT NULL -- 19 FSRS weights (w0-w18)
learning_steps_minutes           INTEGER[] DEFAULT ARRAY[1, 10]
graduating_interval_days         INTEGER DEFAULT 1
easy_interval_days               INTEGER DEFAULT 4
maximum_interval_days            INTEGER DEFAULT 36500 -- ~100 years
minimum_interval_days            INTEGER DEFAULT 1
new_cards_per_day               INTEGER -- Override profile default
reviews_per_day                 INTEGER -- Override profile default
relearning_steps_minutes        INTEGER[] DEFAULT ARRAY[10]
minimum_relearning_interval_days INTEGER DEFAULT 1
lapse_minimum_interval_days     INTEGER DEFAULT 1
lapse_multiplier                DECIMAL(4,3) DEFAULT 0.500
desired_retention               DECIMAL(4,3) DEFAULT 0.900 -- 90% retention
optimization_count              INTEGER DEFAULT 0
last_optimization_at            TIMESTAMPTZ
created_at                      TIMESTAMPTZ DEFAULT NOW()
updated_at                      TIMESTAMPTZ DEFAULT NOW()
```

#### Key Features:
- **JSONB weights** for flexible optimization
- Complete FSRS configuration
- Auto-created with profiles (trigger)
- Daily limit overrides
- Optimization tracking

---

### 8. `user_card_flags`
**Purpose**: User flagging system for reporting card issues

#### Key Columns:
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id             UUID NOT NULL → auth.users(id)
card_template_id    UUID NOT NULL → card_templates(id)
reason              flag_reason NOT NULL
comment             TEXT -- Optional user explanation
created_at          TIMESTAMPTZ DEFAULT NOW()
resolved_at         TIMESTAMPTZ
resolved_by         UUID → auth.users(id)
resolution_action   TEXT -- 'dismissed', 'card_updated', 'card_removed'
resolution_comment  TEXT
```

#### Key Features:
- User quality reporting
- Admin resolution workflow
- Automated flag counting on card_templates

---

### 9. `streak_reward_configs`
**Purpose**: Configurable streak milestone rewards

#### Key Columns:
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
milestone_days      INTEGER UNIQUE NOT NULL
reward_type         TEXT NOT NULL -- 'badge', 'feature_unlock', etc.
reward_title        TEXT NOT NULL
reward_description  TEXT NOT NULL
reward_value        INTEGER -- Optional numeric value
is_active           BOOLEAN DEFAULT TRUE
created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
```

---

### 10. `user_streak_milestones`
**Purpose**: User-achieved streak milestones

#### Key Columns:
```sql
id                   UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id              UUID NOT NULL → auth.users(id)
milestone_days       INTEGER NOT NULL
achieved_at          TIMESTAMPTZ DEFAULT NOW()
reward_claimed       BOOLEAN DEFAULT FALSE
reward_claimed_at    TIMESTAMPTZ
reward_type          TEXT
reward_description   TEXT
created_at           TIMESTAMPTZ DEFAULT NOW()
```

---

### 11. `user_streak_history`
**Purpose**: Daily streak tracking history

#### Key Columns:
```sql
id                 UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id            UUID NOT NULL → auth.users(id)
streak_date        DATE NOT NULL
cards_reviewed     INTEGER DEFAULT 0
streak_day_number  INTEGER NOT NULL
is_streak_break    BOOLEAN DEFAULT FALSE
created_at         TIMESTAMPTZ DEFAULT NOW()
```

---

### 12. `loading_messages`
**Purpose**: Dynamic loading messages for better UX

#### Key Columns:
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
message             TEXT NOT NULL
is_active           BOOLEAN DEFAULT TRUE
weight              INTEGER DEFAULT 1 -- Display frequency
category            TEXT -- 'motivational', 'educational', 'fun'
show_on_study       BOOLEAN DEFAULT TRUE
show_on_review      BOOLEAN DEFAULT TRUE
show_on_new_cards   BOOLEAN DEFAULT TRUE
created_at          TIMESTAMPTZ DEFAULT NOW()
updated_at          TIMESTAMPTZ DEFAULT NOW()
```

---

## Optimized Views

### 1. `v_due_user_cards`
**Purpose**: Cards due for review with complete information

**Key Fields**: All user_cards + card_templates fields, plus:
- `overdue_seconds` (priority calculation)
- `subject_name`, `deck_name` (joined data)

**Filters**: 
- States: learning, review, relearning
- Due: `due_at <= NOW()`
- Active decks, unflagged cards

---

### 2. `v_new_user_cards` 
**Purpose**: Cards in 'new' state ready for introduction

**Key Fields**: Basic card info + content
- `added_at` (creation timestamp for ordering)

**Filters**:
- State: new
- Active decks, unflagged cards

---

### 3. `v_due_counts_by_deck`
**Purpose**: Dashboard summary counts by deck

**Key Fields**: Deck info + aggregated counts:
- `new_count`, `learning_count`, `review_count`
- `total_due_count`, `suspended_count`, `total_cards`

**Features**: 
- Efficient aggregation for dashboard
- Includes deck configuration

---

### 4. `v_user_study_session_info`
**Purpose**: Complete study session information

**Key Fields**: Combined profile + FSRS params:
- User settings (timezone, limits)
- FSRS configuration (weights, intervals)
- Streak information

**Features**:
- Single query for session initialization
- All user preferences in one view

---

## Table Relationships & Dependencies

```
auth.users (Supabase Auth)
├── profiles (1:1) [CASCADE DELETE]
│   └── fsrs_params (1:1, auto-created via trigger) [CASCADE DELETE]
│
├── subjects (1:many) [SET NULL on delete]
│   ├── card_templates (1:many) [SET NULL on delete]
│   └── subjects (self-referencing hierarchy) [SET NULL on delete]
│
├── decks (1:many) [CASCADE DELETE]
│   └── user_cards (1:many) [CASCADE DELETE]
│       └── reviews (1:many, immutable) [CASCADE DELETE]
│
├── card_templates (1:many) [SET NULL on delete]
│   ├── user_cards (1:many) [CASCADE DELETE]
│   ├── reviews (1:many, immutable) [CASCADE DELETE]
│   └── user_card_flags (1:many) [CASCADE DELETE]
│
├── user_card_flags (1:many) [CASCADE DELETE]
├── user_streak_milestones (1:many) [CASCADE DELETE]
└── user_streak_history (1:many) [CASCADE DELETE]

streak_reward_configs (standalone)
loading_messages (standalone)
```

---

## Key FSRS Integration Points

### 1. **Card State Management**
- `user_cards.state` tracks FSRS learning progression
- State transitions: new → learning → review ↔ relearning
- Special states: buried, suspended

### 2. **FSRS Algorithm Variables**
- `user_cards.stability`: Memory stability (retention probability over time)  
- `user_cards.difficulty`: Card difficulty (1.0-10.0 scale)
- `fsrs_params.weights`: 19 JSONB weights (w0-w18) for personalization

### 3. **Rating System (0-3 Scale)**
- **0 = Again**: Card failed, needs relearning
- **1 = Hard**: Correct but difficult  
- **2 = Good**: Standard correct response
- **3 = Easy**: Very easy, longer interval

### 4. **Scheduling**
- `user_cards.due_at`: Next review timestamp
- `reviews.elapsed_days`: Actual time between reviews
- `reviews.scheduled_days`: Planned interval length
- Timezone-aware via `profiles.timezone` + `day_start_time`

---

## Performance Optimizations

### Critical Indexes:
```sql
-- FSRS scheduling (most important)
idx_user_cards_user_due          (user_id, due_at)
idx_user_cards_user_state_due    (user_id, state, due_at)
idx_user_cards_user_deck_due     (user_id, deck_id, due_at)

-- Review analytics
idx_reviews_user_date_desc       (user_id, reviewed_at DESC)
idx_reviews_user_rating_date     (user_id, rating, reviewed_at)

-- Card template search
idx_card_templates_question_fts  GIN(to_tsvector('english', question))
idx_card_templates_answer_fts    GIN(to_tsvector('english', answer))
idx_card_templates_tags          GIN(tags)

-- FSRS parameters
idx_fsrs_params_weights          GIN(weights)
```

---

## Security (Row Level Security)

**All tables have RLS enabled** with policies:

### Standard Pattern:
- Users can manage their own data (`auth.uid() = user_id`)
- Admins can access all data (`profiles.is_admin = TRUE`)
- Public content visible to all (subjects, card_templates with `is_public = TRUE`)

### Special Cases:
- **reviews**: Insert-only for users (immutable history)
- **loading_messages**: Read-only for users, admin-managed
- **streak_reward_configs**: Read-only for users, admin-managed

---

## Common Query Patterns

### 1. **Get Study Queue**
```sql
-- Get due cards for user
SELECT * FROM v_due_user_cards 
WHERE user_id = $1 
ORDER BY overdue_seconds DESC 
LIMIT 50;

-- Get new cards for user  
SELECT * FROM v_new_user_cards
WHERE user_id = $1
ORDER BY added_at ASC
LIMIT 20;
```

### 2. **Dashboard Data**
```sql
-- Deck overview
SELECT * FROM v_due_counts_by_deck 
WHERE user_id = $1;

-- User session info
SELECT * FROM v_user_study_session_info
WHERE user_id = $1;
```

### 3. **Record Review**
```sql
-- Use the integrated function
SELECT process_card_review(
  $user_id, $card_template_id, $deck_id,
  $rating, $response_time_ms,
  $new_stability, $new_difficulty, 
  $new_due_at, $new_state
);
```

---

## Migration Deployment Status

✅ **All 11 migrations successfully applied**
- Extensions and ENUMs
- Core tables with relationships  
- Optimized views
- Helper functions
- Sample data loaded
- RLS policies active

The database is fully operational and ready for modern FSRS implementation with deck-based organization, timezone support, and comprehensive analytics.