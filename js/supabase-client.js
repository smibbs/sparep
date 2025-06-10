// Initialize Supabase client
console.log('Initializing Supabase client...');

let supabase = null;

async function initializeSupabase() {
    try {
        if (!window.supabaseConfig) {
            throw new Error('Supabase configuration not found');
        }

        const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.supabaseConfig;

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            throw new Error('Missing Supabase configuration values');
        }

        // Create Supabase client
        supabase = supabase || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Test the connection
        console.log('Testing Supabase connection...');
        const { data, error } = await supabase.from('cards').select('count').single();
        
        if (error) {
            throw error;
        }
        
        console.log('Supabase connection test successful');
        
        // Set up auth state change listener
        supabase.auth.onAuthStateChange((event, session) => {
            console.log('Supabase auth event:', event, session ? 'with session' : 'no session');
        });
        
        console.log('Supabase client fully initialized');
        return supabase;
        
    } catch (error) {
        console.error('Failed to initialize Supabase client:', error);
        throw error;
    }
}

// Initialize immediately
const supabasePromise = initializeSupabase();

// Export the getter function
export async function getSupabaseClient() {
    return await supabasePromise;
}

export default supabasePromise; 