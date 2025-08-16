(function() {
    const scriptTag = document.currentScript;
    const basePath = scriptTag && scriptTag.dataset.configPath ? scriptTag.dataset.configPath : 'config/';

    async function loadJson(path) {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error('Failed to load ' + path);
        }
        return response.json();
    }

    async function loadConfig() {
        try {
            window.supabaseConfig = await loadJson(basePath + 'supabase-config.json');
        } catch (error) {
            console.warn('Supabase configuration not found. Using example configuration.');
            window.supabaseConfig = await loadJson(basePath + 'supabase-config.example.json');
        }
    }

    loadConfig();
})();
