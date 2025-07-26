// Example Supabase configuration file
// Copy this file to supabase-config.js and replace the placeholder values with your actual Supabase credentials

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Make config available globally
window.supabaseConfig = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY
};

// No export needed - config is available via window.supabaseConfig 