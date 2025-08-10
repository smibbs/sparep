-- =====================================================
-- Migration 01: Extensions and Enums
-- =====================================================
-- Sets up essential extensions and enum types for the FSRS system
-- Run this migration first before any other migrations

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- ENUM TYPES
-- =====================================================

-- User access tier for controlling features and limits
CREATE TYPE user_tier AS ENUM ('free', 'paid', 'admin');

-- FSRS card learning states (standardized FSRS states)
CREATE TYPE card_state AS ENUM (
    'new',          -- Card never studied
    'learning',     -- Card in initial learning phase  
    'review',       -- Card graduated, being reviewed
    'relearning',   -- Card failed, being relearned
    'buried',       -- Card temporarily hidden
    'suspended'     -- Card manually suspended
);

-- User flag reasons for reporting card issues
CREATE TYPE flag_reason AS ENUM (
    'incorrect',    -- Answer is factually wrong
    'spelling',     -- Spelling/grammar errors
    'confusing',    -- Question or answer is unclear
    'other'         -- Other issues (requires comment)
);

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to generate secure random UUIDs
CREATE OR REPLACE FUNCTION gen_secure_uuid()
RETURNS UUID AS $$
BEGIN
    RETURN gen_random_uuid();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Extensions and enums are now ready
-- Next: Run 02-profiles.sql