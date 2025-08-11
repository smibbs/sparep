# AGENTS.md - Comprehensive Project Documentation

## Project Overview

**sparep** is a modern spaced repetition flashcard application built with vanilla JavaScript and Supabase. The application implements the FSRS (Free Spaced Repetition Scheduler) algorithm for optimal learning scheduling. It features a clean, mobile-responsive interface with comprehensive user authentication, progress tracking, and admin functionality.

## Architecture Overview

### Technology Stack
- **Frontend**: Vanilla JavaScript (ES6+ modules), HTML5, CSS3
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Database**: PostgreSQL with Row Level Security (RLS)
- **Authentication**: Supabase Auth with email/password
- **Hosting**: GitHub Pages with automated deployment

### System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client (Web)  │────│   Supabase API   │────│   PostgreSQL    │
│                 │    │                  │    │   Database      │
│ - JS Modules    │    │ - Auth           │    │ - RLS Policies  │
│ - Session Mgmt  │    │ - REST API       │    │ - FSRS Tables   │
│ - FSRS Client   │    │ - Real-time      │    │ - User Data     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Project Structure

```
sparep/
├── index.html                 # Main application entry point
├── login.html                 # Authentication page
├── dashboard.html             # User dashboard
├── admin.html                 # Admin interface
├── profile.html               # User profile management
├── reset-password.html        # Password reset page
│
├── js/                        # JavaScript modules
│   ├── script.js             # Main application controller
│   ├── auth.js               # Authentication service
│   ├── database.js           # Database abstraction layer
│   ├── sessionManager.js     # Session and caching management
│   ├── fsrs.js               # FSRS algorithm implementation
│   ├── config.js             # Application configuration
│   ├── errorHandler.js       # Centralized error handling
│   ├── validator.js          # Input validation utilities
│   ├── supabase-client.js    # Supabase client initialization
│   ├── navigation.js         # Navigation controller
│   ├── slideMenu.js          # Mobile menu implementation
│   ├── streakService.js      # User streak tracking
│   ├── streakUI.js           # Streak UI components
│   ├── fsrsParameters.js     # FSRS parameter management
│   ├── fsrsOptimization.js   # FSRS algorithm optimization
│   ├── fsrsScheduler.js      # FSRS scheduling logic
│   ├── fsrsAnalytics.js      # FSRS performance analytics
│   ├── loadingMessages.js    # Dynamic loading messages
│   ├── logoLoader.js         # Logo loading utilities
│   ├── userAvatar.js         # User avatar management
│   ├── onboarding.js         # User onboarding flow
│   ├── config-loader.js      # Configuration loading
│   ├── dashboard.js          # Dashboard functionality
│   ├── admin.js              # Admin panel functionality
│   └── profile.js            # Profile management
│
├── css/                       # Stylesheets
│   ├── styles.css            # Main application styles
│   ├── auth.css              # Authentication page styles
│   ├── dashboard.css         # Dashboard styles
│   ├── profile.css           # Profile page styles
│   ├── admin.css             # Admin panel styles
│   ├── onboarding.css        # Onboarding styles
│   ├── streak-styles.css     # Streak UI styles
│   ├── slide-menu.css        # Mobile menu styles
│   └── theme.css             # Theme variables and base styles
│
├── components/               # Reusable HTML components
│   └── logo.html            # Logo component
│
├── assets/                   # Static assets
│   └── sketch-underline.svg  # UI graphics
│
├── config/                   # Configuration files
│   ├── supabase-config.js    # Supabase configuration
│   └── supabase-config.example.js # Configuration template
│
├── migration/                # Database migrations
│   ├── README.md            # Migration documentation
│   ├── 01-extensions-and-enums.sql
│   ├── 02-profiles.sql
│   ├── 03-subjects-and-decks.sql
│   ├── 04-card-templates.sql
│   ├── 05-user-cards.sql
│   ├── 06-reviews.sql
│   ├── 07-fsrs-params.sql
│   ├── 08-user-flags-and-streaks.sql
│   ├── 09-loading-messages.sql
│   ├── 10-views.sql
│   └── 11-final-optimizations.sql
│
├── scripts/                  # Build and utility scripts
│   ├── build.js             # Build script
│   └── audit-imports.js     # Import validation script
│
├── tests/                    # Test files and documentation
│   ├── README.md            # Testing documentation
│   ├── index.html           # Test suite entry point
│   ├── database-test.html   # Database connectivity tests
│   ├── security-validation-test.html # Security tests
│   ├── migration-31-security-test.html # Migration tests
│   ├── client-server-security-test.html # Client/server security tests
│   ├── e2e-security-test.html # End-to-end security tests
│   ├── function-signature-test.html # Function signature tests
│   ├── migration-organization-test.html # Migration organization tests
│   ├── schema-integrity-test.html # Schema integrity tests
│   └── test-config.js       # Test configuration
│
├── docs/                     # Project documentation
│   └── CLIENT-SERVER-SECURITY.md # Security documentation
│
├── data/                     # Data files (empty directory)
│
├── package.json              # Node.js dependencies and scripts
├── package-lock.json         # Dependency lock file
├── eslint.config.js          # ESLint configuration
├── env.example               # Environment variables template
├── README.md                 # Project README
├── DATABASE_STRUCTURE.md     # Database documentation
├── FSRS_PERSONALIZATION_GUIDE.md # FSRS customization guide
├── GITHUB_SECRETS_SETUP.md   # GitHub Actions setup guide
├── SUPABASE_PRODUCTION_CHECKLIST.md # Production deployment guide
├── admin-setup.sql           # Admin user setup script
├── streak_rewards_schema.sql # Streak rewards database schema
└── CNAME                     # Custom domain configuration
```

## Core Architecture Components

### 1. Authentication System (`js/auth.js`)

**Class**: `AuthService`

**Responsibilities**:
- User registration and login
- Session management
- User profile management
- Admin privilege checking (client-side UI optimization only)
- Password reset functionality
- Mobile-optimized authentication flows

**Key Methods**:
- `getCurrentUser()` - Get authenticated user
- `getUserProfile()` - Fetch user profile with tier information
- `isAdmin()` - Client-side admin check (UI optimization only)
- `verifyAdminAccess()` - Server-side admin verification (secure)
- `signOut()` - User logout with cleanup
- `updateUserProfile()` - Profile management

**Security Features**:
- Client-side validation with server-side enforcement
- Mobile-specific error handling and timeouts
- Comprehensive input sanitization
- Session persistence across page reloads

### 2. Database Layer (`js/database.js`)

**Class**: `DatabaseService`

**Responsibilities**:
- Supabase API abstraction
- FSRS algorithm integration
- Session data management
- Card progress tracking
- User statistics and analytics
- Mobile-specific retry logic

**Key Methods**:
- `getCardsDue(userId)` - Fetch cards ready for review
- `getNewCards(userId, limit)` - Get new unreviewed cards
- `recordReview(reviewData)` - Store individual review
- `submitBatchReviews(sessionData)` - Batch review submission
- `initializeMissingUserProgress(userId)` - Setup new user cards
- `flagCard(cardId, reason, comment)` - Report problematic cards
- `getUserFSRSParameters(userId)` - Get user's FSRS settings

**Advanced Features**:
- Mobile retry logic with exponential backoff
- Composite primary key handling (user_id, card_template_id, deck_id)
- FSRS parameter optimization integration
- Comprehensive error classification and handling

### 3. Session Management (`js/sessionManager.js`)

**Class**: `SessionManager`

**Responsibilities**:
- Study session orchestration
- Local caching and persistence
- Cross-browser storage compatibility
- Mobile-specific optimizations
- Progress tracking and completion detection

**Storage Strategy**:
- **Primary**: `sessionStorage` (best for sessions)
- **Fallback**: `localStorage` (when sessionStorage unavailable)
- **Ultimate Fallback**: In-memory storage (Safari private browsing)

**Key Features**:
- Safari private browsing detection and handling
- Mobile cache management with size limits
- Session state validation and recovery
- Automatic cleanup and memory management

### 4. FSRS Algorithm (`js/fsrs.js`)

**Implementation**: Modern FSRS algorithm with full parameter support

**Key Components**:
- **Rating Scale**: 0-3 (Again=0, Hard=1, Good=2, Easy=3)
- **Card States**: new, learning, review, relearning, buried, suspended
- **Parameter Support**: Full 19-parameter FSRS weights (w0-w18)
- **Precision**: High-precision decimal calculations

**Core Functions**:
- `calculateInitialStability(rating, params)` - New card stability
- `calculateInitialDifficulty(rating, params)` - New card difficulty
- `updateStability(current, difficulty, rating, elapsed, params)` - Update stability
- `updateDifficulty(current, rating, params)` - Update difficulty
- `calculateNextReview(stability, difficulty, rating, params)` - Schedule next review
- `calculateRetrievability(elapsed, stability)` - Memory strength calculation

### 5. Error Handling (`js/errorHandler.js`)

**Class**: `ErrorHandler`

**Error Classification System**:
- `NETWORK_ERROR` - Connection issues
- `AUTH_ERROR` - Authentication failures
- `PERMISSION_ERROR` - Access denied
- `QUOTA_ERROR` - Storage limitations
- `DATABASE_ERROR` - Supabase/PostgreSQL errors
- `VALIDATION_ERROR` - Input validation failures
- `FSRS_ERROR` - Algorithm-specific errors
- `DECK_ERROR` - Deck management issues
- `COMPOSITE_KEY_ERROR` - Primary key violations
- `ENUM_ERROR` - Database enum violations

**Features**:
- User-friendly error messages
- Retry logic for transient errors
- Error tracking and statistics
- Context-aware error handling

### 6. Validation System (`js/validator.js`)

**Class**: `Validator`

**Validation Coverage**:
- User input sanitization with XSS protection
- FSRS rating validation (0-3 scale)
- Email format validation
- Password strength requirements
- UUID format validation
- Date format validation
- Numeric bounds checking

**Security Features**:
- Enhanced XSS protection
- Input length limits
- Type checking and conversion
- SQL injection prevention

## Database Schema Overview

### Core Tables

#### `profiles`
User account information with timezone support:
```sql
- id (UUID, primary key)
- email (TEXT, unique)
- display_name (TEXT)
- user_tier (ENUM: free, paid, admin)
- timezone (TEXT, default: UTC)
- day_start_time (TIME, default: 04:00:00)
- daily_new_cards_limit (INTEGER, default: 20)
- daily_review_limit (INTEGER, default: 100)
- current_daily_streak (INTEGER, default: 0)
- longest_daily_streak (INTEGER, default: 0)
```

#### `subjects`
Hierarchical content organization:
```sql
- id (UUID, primary key)
- name (TEXT, unique)
- description (TEXT)
- is_active (BOOLEAN, default: true)
- is_public (BOOLEAN, default: false)
- created_by (UUID, references profiles.id)
```

#### `decks`
User-specific card collections:
```sql
- id (UUID, primary key)
- user_id (UUID, references profiles.id)
- name (TEXT)
- description (TEXT)
- is_active (BOOLEAN, default: true)
- daily_new_cards_limit (INTEGER)
- daily_review_limit (INTEGER)
```

#### `card_templates`
Shared card content:
```sql
- id (UUID, primary key)
- question (TEXT, not null)
- answer (TEXT, not null)
- subject_id (UUID, references subjects.id)
- subsection (TEXT)
- flagged_for_review (BOOLEAN, default: false)
- created_by (UUID, references profiles.id)
```

#### `user_cards`
Individual progress tracking (composite primary key):
```sql
- user_id (UUID, references profiles.id)
- card_template_id (UUID, references card_templates.id)
- deck_id (UUID, references decks.id)
- state (ENUM: new, learning, review, relearning, buried, suspended)
- stability (DECIMAL(10,6))
- difficulty (DECIMAL(10,6))
- due_at (TIMESTAMPTZ)
- last_reviewed_at (TIMESTAMPTZ)
- total_reviews (INTEGER, default: 0)
- reps (INTEGER, default: 0)
- lapses (INTEGER, default: 0)
- PRIMARY KEY (user_id, card_template_id, deck_id)
```

#### `reviews`
Immutable review history:
```sql
- id (UUID, primary key)
- user_id (UUID, references profiles.id)
- card_template_id (UUID, references card_templates.id)
- deck_id (UUID, references decks.id)
- rating (INTEGER, 0-3 scale)
- response_time_ms (INTEGER)
- stability_before/after (DECIMAL(10,6))
- difficulty_before/after (DECIMAL(10,6))
- state_before/after (card_state)
- reviewed_at (TIMESTAMPTZ)
```

#### `fsrs_params`
JSONB parameter storage:
```sql
- user_id (UUID, primary key, references profiles.id)
- weights (JSONB) -- w0 through w18 parameters
- learning_steps_minutes (INTEGER[])
- relearning_steps_minutes (INTEGER[])
- graduating_interval_days (INTEGER)
- easy_interval_days (INTEGER)
- maximum_interval_days (INTEGER)
- desired_retention (DECIMAL(4,3))
```

### Optimized Views

#### `v_due_user_cards`
Pre-calculated due cards for efficient querying:
- Joins user_cards, card_templates, and subjects
- Filters for active, unflagged cards
- Calculates overdue status and priority
- Includes all necessary display information

#### `v_new_user_cards`
Available new cards for study:
- Shows cards not yet in user_cards table
- Filtered by subject activity status
- Ordered by addition date
- Ready for progress initialization

## Coding Conventions and Standards

### JavaScript Patterns

#### Module Structure
```javascript
// Standard module pattern
import { dependency1, dependency2 } from './module.js';
import config from './config.js';

class ServiceName {
    constructor() {
        // Initialize with proper error handling
    }
    
    async method() {
        // Implementation with error handling
    }
}

// Export both class and default instance
export { ServiceName };
const instance = new ServiceName();
export default instance;
```

#### Error Handling Pattern
```javascript
// Consistent error handling with classification
try {
    const result = await operation();
    return result;
} catch (error) {
    const handledError = handleError(error, 'context');
    throw new Error(handledError.userMessage);
}
```

#### Validation Pattern
```javascript
// Input validation before processing
validateUserId(userId, 'operation context');
validateRating(rating, 'review submission');
const sanitizedComment = validateComment(comment, 500, 'flagging');
```

#### Mobile Optimization Pattern
```javascript
// Mobile-specific handling
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const config = isMobile ? mobileConfig : desktopConfig;

if (isMobile) {
    applyMobileOptimizations();
}
```

### CSS Architecture

#### File Organization
- `theme.css` - CSS custom properties and base theme
- `styles.css` - Main application styles
- Component-specific CSS files for major features
- Consistent naming with BEM-like methodology

#### Responsive Design
```css
/* Mobile-first approach */
.component {
    /* Mobile styles */
}

@media (min-width: 768px) {
    .component {
        /* Desktop styles */
    }
}

/* CSS custom properties for theming */
:root {
    --primary-color: #007bff;
    --secondary-color: #6c757d;
    --success-color: #28a745;
    --error-color: #dc3545;
}
```

### Security Patterns

#### Client-Side Security Measures
```javascript
// Input sanitization
const sanitized = Validator.sanitizeString(userInput, maxLength);

// Admin checks (client-side UI optimization only)
const isAdmin = await auth.isAdmin(); // For UI display
const adminVerified = await auth.verifyAdminAccess(); // For security

// SQL injection prevention through parameterized queries
const { data, error } = await supabase
    .from('table')
    .select('*')
    .eq('user_id', userId); // Parameterized, safe
```

#### Server-Side Security (Database)
- **Row Level Security (RLS)** on all tables
- **Composite primary keys** for data integrity
- **ENUM constraints** for data validation
- **Admin-only functions** with permission verification

### Performance Patterns

#### Caching Strategy
```javascript
// LRU cache with size limits
const cache = new Map();
const MAX_CACHE_SIZE = isMobile ? 25 : 50;

function cacheWithEviction(key, value) {
    if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(key, value);
}
```

#### Batch Processing
```javascript
// Batch database operations
const batchData = sessionData.ratings;
const updates = prepareBatchUpdates(batchData);
await supabase.from('user_cards').upsert(updates);
await supabase.from('reviews').insert(reviewRecords);
```

### Configuration Management

#### Centralized Configuration (`js/config.js`)
```javascript
// Hierarchical configuration with defaults
export const SESSION_CONFIG = {
    CARDS_PER_SESSION: 10,
    FREE_USER_DAILY_LIMIT: 100,
    PAID_USER_DAILY_LIMIT: 9999
};

export const FSRS_CONFIG = {
    DEFAULT_WEIGHTS: { w0: 0.4872, /* ... */ w18: 0.6468 },
    DESIRED_RETENTION: 0.9
};

// Export for easy access
export default {
    ...SESSION_CONFIG,
    FSRS_CONFIG,
    // ... other configs
};
```

### Testing Patterns

#### Import Validation
- **Automated import auditing** via `scripts/audit-imports.js`
- **ESLint integration** for unresolved imports
- **Build-time validation** to catch missing exports

#### Manual Testing Structure
- Dedicated test HTML pages for different components
- Database connectivity tests
- Security validation tests
- Migration integrity tests

## Development Workflow

### 1. Code Quality Assurance
```bash
# Validation pipeline
npm run audit-imports  # Verify all imports are valid
npm run lint          # ESLint checks
npm run build         # Build validation
```

### 2. Database Management
- **Sequential migrations** (01-11) for schema updates
- **RLS policy testing** for security verification
- **View optimization** for query performance

### 3. Mobile Development
- **Progressive Web App** features for mobile experience
- **Touch-optimized UI** with appropriate sizing
- **Offline capability** through session caching
- **Safari private browsing** compatibility

### 4. Deployment Process
- **GitHub Actions** automated deployment
- **GitHub Pages** hosting with custom domain support
- **Environment-specific configuration** handling

## Key Design Decisions

### 1. Vanilla JavaScript Choice
- **No framework dependencies** for minimal bundle size
- **Direct DOM manipulation** for maximum performance
- **ES6+ modules** for code organization
- **Progressive enhancement** for broad compatibility

### 2. Supabase Integration
- **PostgreSQL** for relational data integrity
- **Row Level Security** for multi-tenant architecture
- **Real-time capabilities** for future enhancements
- **Built-in authentication** reducing custom auth complexity

### 3. FSRS Algorithm Implementation
- **Full parameter support** for personalized learning
- **0-3 rating scale** (standard FSRS) for algorithm accuracy
- **High precision calculations** for optimal scheduling
- **Immutable review history** for analytics and optimization

### 4. Mobile-First Design
- **Progressive Web App** approach for app-like experience
- **Touch-optimized interface** with appropriate tap targets
- **Responsive typography** and spacing
- **Network-aware caching** for poor connectivity scenarios

### 5. Security-First Architecture
- **Client-side input validation** with server-side enforcement
- **XSS protection** through input sanitization
- **SQL injection prevention** via parameterized queries
- **Admin privilege verification** with both client and server checks

## Extension Guidelines

### Adding New Features

#### 1. Service Layer Pattern
```javascript
// Create service class with error handling
class NewFeatureService {
    constructor() {
        this.supabasePromise = getSupabaseClient();
    }
    
    async mainOperation(params) {
        try {
            validateRequiredParams(params);
            const result = await this.performOperation(params);
            return result;
        } catch (error) {
            const handledError = handleError(error, 'NewFeature');
            throw new Error(handledError.userMessage);
        }
    }
}
```

#### 2. Database Integration
- Add migration file in sequential order
- Include RLS policies for user data isolation
- Create optimized views for common queries
- Update `database.js` with new methods

#### 3. UI Components
- Follow existing CSS architecture
- Implement mobile-responsive design
- Add appropriate error states and loading indicators
- Include accessibility features (ARIA labels, keyboard navigation)

### Configuration Updates
- Add new config sections to `js/config.js`
- Update default values and validation rules
- Document configuration options
- Maintain backward compatibility

### Testing New Features
- Create dedicated test HTML page
- Validate database operations
- Test mobile-specific behavior
- Verify security constraints

## Security Considerations

### Client-Side Security
- **Input validation and sanitization** on all user inputs
- **XSS prevention** through content escaping
- **Client-side admin checks** for UI optimization only
- **Sensitive data handling** with proper cleanup

### Server-Side Security (Database)
- **Row Level Security (RLS)** enforced on all tables
- **Admin function verification** using `auth.uid()`
- **Parameterized queries** preventing SQL injection
- **Data type constraints** through PostgreSQL enums

### Authentication Security
- **Supabase Auth** providing OAuth and email/password
- **Session management** with proper cleanup
- **Password reset** with secure token handling
- **Multi-factor authentication** support (future enhancement)

This comprehensive documentation serves as a complete reference for understanding, maintaining, and extending the sparep application. The architecture prioritizes security, performance, and maintainability while providing an excellent user experience across all devices.