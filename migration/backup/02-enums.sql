-- Migration: 02-enums.sql
-- Description: Creates all custom enum types used throughout the database
-- Dependencies: 01-initial-setup.sql

-- Create user tier enum for user access levels
CREATE TYPE user_tier AS ENUM ('free', 'paid', 'admin');

-- Create card state enum for FSRS learning states
CREATE TYPE card_state AS ENUM ('new', 'learning', 'review', 'relearning', 'buried', 'suspended');

-- Create flag reason enum for user card flagging
CREATE TYPE flag_reason AS ENUM ('incorrect', 'spelling', 'confusing', 'other');

-- Comments
COMMENT ON TYPE user_tier IS 'User access tiers: free (20 reviews/day), paid (unlimited), admin (unlimited + flagged cards)';
COMMENT ON TYPE card_state IS 'Learning states for FSRS algorithm: new, learning, review, relearning, buried, suspended';
COMMENT ON TYPE flag_reason IS 'Reasons users can flag cards: incorrect, spelling, confusing, other';