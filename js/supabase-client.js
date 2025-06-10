// Initialize Supabase client
console.log('Initializing Supabase client...');

let supabase = null;
let initializationPromise = null;

async function initializeSupabase() {
    try {
        // Return existing initialization if in progress
        if (initializationPromise) {
            return await initializationPromise;
        }

        // Return existing client if already initialized
        if (supabase) {
            return supabase;
        }

        if (!window.supabaseConfig) {
            throw new Error('Supabase configuration not found');
        }

        const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.supabaseConfig;

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            throw new Error('Missing Supabase configuration values');
        }

        // Create Supabase client
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client created successfully');
        
        return supabase;
    } catch (error) {
        console.error('Failed to initialize Supabase client:', error);
        throw error;
    }
}

// Initialize and store the promise
initializationPromise = initializeSupabase();

// Export the getter function
export async function getSupabaseClient() {
    return await initializationPromise;
}

export default initializationPromise; 