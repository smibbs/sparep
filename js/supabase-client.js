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

        // Create Supabase client if not already created
        if (!supabase) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('Supabase client created successfully');
        }
        
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