// Example Supabase configuration file
// Copy this file to supabase-config.js and replace the placeholder values with your actual Supabase credentials

const SUPABASE_CONFIG = {
    // Your Supabase project URL from: Settings -> API -> Project URL
    url: 'https://your-project-id.supabase.co',
    
    // Your Supabase anon/public key from: Settings -> API -> Project API keys -> anon/public
    anonKey: 'your-anon-key-goes-here'
};

// Export configuration for use in other modules
export { SUPABASE_CONFIG }; 