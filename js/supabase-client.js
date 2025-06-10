// Initialize Supabase client with configuration from global object
async function createSupabaseClient() {
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
        console.log('Initializing Supabase client...');
        
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
                console.log('Testing Supabase connection...');
                // Attempt to get the current user session
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error) throw error;
                console.log('Supabase connection test successful');
                return true;
            } catch (error) {
                console.error('Error testing Supabase connection:', error);
                return false;
            }
        };

        // Wait for connection test
        const isConnected = await testConnection();
        if (!isConnected) {
            throw new Error('Failed to establish Supabase connection');
        }

        // Set up auth state change listener
        supabase.auth.onAuthStateChange((event, session) => {
            console.log('Supabase auth event:', event, session ? 'with session' : 'no session');
        });

        console.log('Supabase client fully initialized');
        return supabase;
    } catch (error) {
        console.error('Error initializing Supabase client:', error);
        throw error;
    }
}

// Initialize the client asynchronously
(async () => {
    try {
        window.supabaseClient = await createSupabaseClient();
        // Dispatch an event when the client is ready
        window.dispatchEvent(new Event('supabaseClientReady'));
    } catch (error) {
        console.error('Failed to initialize Supabase client:', error);
        // Dispatch an event for the error
        window.dispatchEvent(new CustomEvent('supabaseClientError', { detail: error }));
    }
})(); 