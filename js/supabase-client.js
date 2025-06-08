// Import configuration
import { SUPABASE_CONFIG } from '../config/supabase-config.js';

/**
 * Initialize and export the Supabase client
 * Throws an error if configuration is missing or invalid
 */
function createSupabaseClient() {
    // Validate configuration
    if (!SUPABASE_CONFIG) {
        throw new Error('Supabase configuration is missing');
    }

    if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
        throw new Error('Supabase URL and anon key are required');
    }

    try {
        // Create and initialize the Supabase client
        const supabase = window.supabase.createClient(
            SUPABASE_CONFIG.url,
            SUPABASE_CONFIG.anonKey,
            {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true
                }
            }
        );

        // Test the connection
        const testConnection = async () => {
            try {
                // Attempt to get the current user session
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;
                console.log('Supabase client initialized successfully');
                return true;
            } catch (error) {
                console.error('Error testing Supabase connection:', error.message);
                return false;
            }
        };

        // Run connection test
        testConnection();

        return supabase;
    } catch (error) {
        console.error('Error initializing Supabase client:', error.message);
        throw error;
    }
}

// Create and export the client instance
export const supabase = createSupabaseClient();

// Initialize Supabase client
const initSupabase = () => {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.supabaseConfig;
    return supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
};

// Create and expose the client globally
window.supabaseClient = initSupabase();

// Test the connection
window.supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('Supabase auth event:', event);
}); 