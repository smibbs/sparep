(function() {
    const scriptTag = document.currentScript;
    const basePath = scriptTag && scriptTag.dataset.configPath ? scriptTag.dataset.configPath : 'config/';

    function inject(code) {
        const s = document.createElement('script');
        s.textContent = code;
        document.head.appendChild(s);
    }

    function loadConfig(path) {
        return fetch(path)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load ' + path);
                }
                return response.text();
            })
            .then(code => inject(code));
    }

    loadConfig(basePath + 'supabase-config.js')
        .catch((error) => {
            console.error('Supabase configuration not found. Ensure GitHub secrets are configured.', error);
            if (typeof window !== 'undefined') {
                window.supabaseConfigError = 'Supabase configuration not found';
            }
        });
})();
