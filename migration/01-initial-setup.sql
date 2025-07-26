-- Migration 01: Initial Database Setup (Current Schema)
-- Description: Creates extensions and basic database setup functions
-- Dependencies: None - must be run first

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security by default for all tables
-- Individual table policies are defined in later migrations