// Supabase configuration
const SUPABASE_URL = 'https://fcncyvokyypauanqgaxd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZjbmN5dm9reXlwYXVhbnFnYXhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzOTczODQsImV4cCI6MjA2NDk3MzM4NH0.V4ux2pLgZaELwbWTj6U7R48LgNlaMrj51uxLqEBfw-s';

// Make config available globally
window.supabaseConfig = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY
}; 