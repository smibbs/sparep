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

    console.log('[SupabaseClient] Waiting for config...');
    while (attempts < maxAttempts) {
        if (window.supabaseConfig) {
            console.log('[SupabaseClient] Config found after', attempts, 'attempts');
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        attempts++;
        if (attempts % 10 === 0) {
            console.log('[SupabaseClient] Still waiting for config...', attempts, '/', maxAttempts);
        }
    }
    console.error('[SupabaseClient] Config timeout after', maxAttempts, 'attempts');
    throw new SupabaseConfigError('Supabase configuration not loaded');
}

async function initializeSupabase() {
    try {
        console.log('[SupabaseClient] initializeSupabase called');

        // Return existing client if already initialized
        if (supabase) {
            console.log('[SupabaseClient] Returning existing client');
            return supabase;
        }

        // Return existing initialization if in progress
        if (initializationPromise) {
            console.log('[SupabaseClient] Initialization already in progress, waiting...');
            return await initializationPromise;
        }

        console.log('[SupabaseClient] Starting new initialization');
        // Wait for Supabase library and configuration to be available
        await waitForSupabaseLibrary();
        console.log('[SupabaseClient] Supabase library ready');
        await waitForSupabaseConfig();
        console.log('[SupabaseClient] Config ready');

        const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.supabaseConfig;
        console.log('[SupabaseClient] Validating config values...');

        const missingValues = !SUPABASE_URL || !SUPABASE_ANON_KEY;
        const placeholderValues =
            SUPABASE_URL.includes('YOUR_SUPABASE_URL') ||
            SUPABASE_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY');

        if (missingValues || placeholderValues) {
            console.error('[SupabaseClient] Config validation failed');
            throw new SupabaseConfigError('Supabase configuration is missing or contains placeholder values.');
        }

        console.log('[SupabaseClient] Config validated, creating client...');
        // Create Supabase client
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('[SupabaseClient] Client created, testing with getSession...');

        // Test the client
        await supabase.auth.getSession();
        console.log('[SupabaseClient] Session test complete');

        // Supabase client created and tested successfully
        console.log('[SupabaseClient] Initialization complete, returning client');
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

// DON'T auto-initialize - let the first call to getSupabaseClient() trigger initialization
// This prevents the module from trying to initialize before config is loaded

// Export the getter function as default
export default getSupabaseClient;
