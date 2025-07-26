-- Migration 02: Custom Enum Types (Current Schema)
-- Description: Creates all custom enum types used throughout the database
-- Dependencies: 01-initial-setup.sql

-- User tier enum for subscription and access levels
CREATE TYPE user_tier AS ENUM ('free', 'paid', 'admin');

-- Card state enum for FSRS algorithm states
CREATE TYPE card_state AS ENUM ('new', 'learning', 'review', 'relearning', 'buried', 'suspended');

-- Flag reason enum for user-reported card issues
CREATE TYPE flag_reason AS ENUM ('incorrect', 'spelling', 'confusing', 'other');