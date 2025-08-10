// Initialize Supabase client

class SupabaseConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SupabaseConfigError';
    }
}

let supabase = null;
let initializationPromise = null;
let initializationRetries = 0;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function waitForSupabaseLibrary() {
    let attempts = 0;
    const maxAttempts = 10;
    const delay = 100; // 100ms between attempts

    while (attempts < maxAttempts) {
        if (window.supabase) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        attempts++;
    }
    throw new Error('Supabase library failed to load');
}

async function waitForSupabaseConfig() {
    let attempts = 0;
    const maxAttempts = 50;
    const delay = 100; // 100ms between attempts

    while (attempts < maxAttempts) {
        if (window.supabaseConfig) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        attempts++;
    }
    throw new SupabaseConfigError('Supabase configuration not loaded');
}

async function initializeSupabase() {
    try {
        // Return existing client if already initialized
        if (supabase) {
            return supabase;
        }

        // Return existing initialization if in progress
        if (initializationPromise) {
            return await initializationPromise;
        }

        // Wait for Supabase library and configuration to be available
        await waitForSupabaseLibrary();
        await waitForSupabaseConfig();

        const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.supabaseConfig;
        const missingValues = !SUPABASE_URL || !SUPABASE_ANON_KEY;
        const placeholderValues =
            SUPABASE_URL.includes('YOUR_SUPABASE_URL') ||
            SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');

        if (missingValues || placeholderValues) {
            throw new SupabaseConfigError('Supabase configuration is missing or contains placeholder values.');
        }

        // Create Supabase client
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        // Test the client
        await supabase.auth.getSession();

        // Supabase client created and tested successfully
        return supabase;
    } catch (error) {
        // Failed to initialize Supabase client

        // Clear the failed client
        supabase = null;

        // Retry initialization if under max retries and not a config error
        if (!(error instanceof SupabaseConfigError) && initializationRetries < MAX_RETRIES) {
            initializationRetries++;
            // Retrying Supabase initialization
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return initializeSupabase();
        }

        throw error;
    }
}

// Export the getter function
export async function getSupabaseClient() {
    try {
        // Initialize if not already done
        if (!initializationPromise) {
            initializationPromise = initializeSupabase();
        }

        // Wait for initialization and return client
        return await initializationPromise;
    } catch (error) {
        // Clear failed initialization
        initializationPromise = null;
        if (typeof window !== 'undefined' && typeof showError === 'function') {
            showError(error.message || 'Failed to initialize Supabase client.');
        }
        throw error;
    }
}

// Initialize immediately and set global reference
initializationPromise = initializeSupabase()
    .then(client => {
        // Set global reference for other modules
        if (typeof window !== 'undefined') {
            window.supabaseClient = client;
        }
        return client;
    })
    .catch(error => {
        if (typeof window !== 'undefined' && typeof showError === 'function') {
            showError(error.message || 'Failed to initialize Supabase client.');
        }
        throw error;
    });

// Export the getter function as default
export default getSupabaseClient;
