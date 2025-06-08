// Example Supabase configuration file
// Copy this file to supabase-config.js and replace the placeholder values with your actual Supabase credentials

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Make config available globally
window.supabaseConfig = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY
};

// Export configuration for use in other modules
export { SUPABASE_URL, SUPABASE_ANON_KEY }; 