-- Migration: 07a-add-public-flag.sql
-- Description: Adds is_public and is_admin columns to user_profiles table
-- This needs to run before the security policies

-- Add is_public column to user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- Add is_admin column to user_profiles if it doesn't exist
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Add comment
COMMENT ON COLUMN public.user_profiles.is_public IS 'Whether the user profile is publicly visible';
COMMENT ON COLUMN public.user_profiles.is_admin IS 'Whether the user has administrator privileges'; 