-- Admin Setup SQL
-- Run these queries in your Supabase SQL Editor to set up admin access

-- 1. First, check your current user tier (replace with your email)
SELECT 
    up.id,
    up.email,
    up.display_name,
    up.user_tier,
    up.created_at
FROM auth.users au
JOIN public.user_profiles up ON up.id = au.id
WHERE au.email = 'your-email@example.com';  -- REPLACE WITH YOUR EMAIL

-- 2. If your user_tier is not 'admin', run this to update it (replace with your email)
UPDATE public.user_profiles 
SET user_tier = 'admin'
WHERE id = (
    SELECT au.id 
    FROM auth.users au 
    WHERE au.email = 'your-email@example.com'  -- REPLACE WITH YOUR EMAIL
);

-- 3. Verify the update worked
SELECT 
    up.id,
    up.email,
    up.display_name,
    up.user_tier,
    up.created_at
FROM auth.users au
JOIN public.user_profiles up ON up.id = au.id
WHERE au.email = 'your-email@example.com';  -- REPLACE WITH YOUR EMAIL

-- Alternative: If you want to make ALL users admin for testing (BE CAREFUL!)
-- UPDATE public.user_profiles SET user_tier = 'admin';

-- 4. Check all users and their tiers
SELECT 
    up.email,
    up.display_name,
    up.user_tier,
    up.created_at
FROM public.user_profiles up
ORDER BY up.created_at;