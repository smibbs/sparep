// Initialize Supabase client with configuration from global object
function createSupabaseClient() {
    // Get config from global object
    const config = window.supabaseConfig;

    // Validate configuration
    if (!config) {
        throw new Error('Supabase configuration is missing');
    }

    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        throw new Error('Supabase URL and anon key are required');
    }

    try {
        // Create and initialize the Supabase client
        const supabase = window.supabase.createClient(
            config.SUPABASE_URL,
            config.SUPABASE_ANON_KEY,
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

// Create and expose the client globally
window.supabaseClient = createSupabaseClient();

// Test the connection
window.supabaseClient.auth.onAuthStateChange((event, session) => {
    console.log('Supabase auth event:', event);
}); 