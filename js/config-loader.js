(function() {
    const scriptTag = document.currentScript;
    const basePath = scriptTag && scriptTag.dataset.configPath ? scriptTag.dataset.configPath : 'config/';

    const isLocalhost = () => {
        const h = window.location.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
    };

    async function loadJson(path) {
        const response = await fetch(path, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Failed to load ' + path);
        }
        return response.json();
    }

    function loadScript(path) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = path;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Failed to load script ' + path));
            document.head.appendChild(s);
        });
    }

    async function loadConfig() {
        // Preferred order:
        // 1) config/supabase-config.json (in repo or injected by CI)
        // 2) config/supabase-config.local.json (developer local config)
        // 3) config/supabase-config.js (legacy JS config that sets window.supabaseConfig)
        // 4) config/supabase-config.example.json (placeholders; will cause client init error)
        const tried = [];

        // Attempt 1: main JSON
        try {
            window.supabaseConfig = await loadJson(basePath + 'supabase-config.json');
            return;
        } catch (e) {
            tried.push('supabase-config.json');
        }

        // Attempt 2: local JSON (useful for localhost dev)
        try {
            window.supabaseConfig = await loadJson(basePath + 'supabase-config.local.json');
            console.info('[config-loader] Loaded local Supabase config');
            return;
        } catch (e) {
            tried.push('supabase-config.local.json');
        }

        // Attempt 3: legacy JS config that assigns window.supabaseConfig
        try {
            await loadScript(basePath + 'supabase-config.js');
            if (window.supabaseConfig && window.supabaseConfig.SUPABASE_URL && window.supabaseConfig.SUPABASE_ANON_KEY) {
                console.info('[config-loader] Loaded legacy JS Supabase config');
                return;
            }
        } catch (e) {
            tried.push('supabase-config.js');
        }

        // Attempt 4: example JSON (placeholders)
        try {
            console.warn('[config-loader] Falling back to example Supabase config. This will not work for real auth.');
            window.supabaseConfig = await loadJson(basePath + 'supabase-config.example.json');
        } catch (e) {
            console.error('[config-loader] Could not load any Supabase config files. Tried:', tried.join(', '));
            throw e;
        }
    }

    // Kick off async loading early
    loadConfig();
})();
