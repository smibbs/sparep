-- Migration: 01-initial-setup.sql
-- Description: Initial database setup with extensions and helper functions
-- This migration sets up the basic database structure and helper functions

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Set up storage for user avatars
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT DO NOTHING;

-- Create updated_at trigger function (used by multiple tables)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create is_admin helper function
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE id = user_id AND is_admin = true
    );
END;
$$ language 'plpgsql' SECURITY DEFINER;

-- Comments
COMMENT ON FUNCTION update_updated_at_column IS 'Trigger function to update updated_at timestamp';
COMMENT ON FUNCTION is_admin IS 'Helper function to check if a user has admin privileges'; 