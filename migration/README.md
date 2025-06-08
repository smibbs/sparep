# Database Migration Files

This directory contains SQL migration files for setting up the Supabase database schema.

## File Order and Dependencies

1. `01-users-table.sql`: Creates user profiles table and authentication setup
2. `02-cards-table.sql`: Creates the flashcards table
3. `03-subjects-table.sql`: Creates subjects organization table
4. `04-user-card-progress-table.sql`: Creates user progress tracking table
5. `05-review-history-table.sql`: Creates review history table
6. `06-fsrs-parameters-table.sql`: Creates FSRS algorithm parameters table
7. `07-security-policies.sql`: Sets up Row Level Security policies

## How to Apply Migrations

1. Log into your Supabase project dashboard
2. Go to SQL Editor
3. Copy and paste each migration file in order
4. Execute each script
5. Verify the tables are created in Database > Tables

## Important Notes

- These migrations assume a fresh Supabase project
- The `auth` schema is automatically created by Supabase
- Run migrations in order - they have dependencies
- Backup your database before running migrations in production
- Test migrations in a development environment first

## Rollback

Each migration can be rolled back by dropping the created tables in reverse order:

```sql
-- Example rollback commands (if needed)
DROP TABLE IF EXISTS public.user_profiles CASCADE;
-- ... other tables
```

## Verification

After running migrations, verify:
1. Tables exist in the public schema
2. RLS policies are enabled
3. Triggers are created
4. Indexes are present

## Troubleshooting

Common issues:
- Permission denied: Ensure you're using the correct Supabase role
- Relation already exists: Drop the table first or skip that migration
- Foreign key violation: Ensure you're running migrations in order 