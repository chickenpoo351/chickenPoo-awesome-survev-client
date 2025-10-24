// pageHook.js (runs in the page context — has direct access to window.PIXI)
// Exposes window.__CUSTOM_SKINS.ready Promise and accepts asset mappings via postMessage.
console.log('[PH] pageHook.js loaded into page context');

(function waitForPixi() {
    if (window.PIXI) {
        console.log('[PH] PIXI detected:', window.PIXI);
        try {
            console.log('[PH] PIXI keys:', Object.keys(window.PIXI));
            console.log('[PH] PIXI.Application?', typeof window.PIXI.Application);
            console.log('[PH] PIXI.Texture?', typeof window.PIXI.Texture);
            console.log('[PH] PIXI.VERSION?', window.PIXI.VERSION);
        } catch (err) {
            console.warn('[PH] error inspecting PIXI:', err);
        }
    } else {
        console.log('[PH] waiting for PIXI...');
        setTimeout(waitForPixi, 500);
    }
})();


(function () {
    if (window.__CUSTOM_SKINS && window.__CUSTOM_SKINS.ready) {
        // already injected
        window.postMessage({ type: 'CUSTOM_SKINS_LOG', msg: 'pageHook already present' }, '*');
        return;
    }

    let resolveReady, rejectReady;
    const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });

    window.__CUSTOM_SKINS = {
        ready,
        _log: (...args) => { try { console.log('[CUSTOM_SKINS]', ...args); } catch (e) { } }
    };

    // Helper: try to detect PIXI now or later.
    function detectPixiOnce() {
        try {
            if (window.PIXI && window.PIXI.utils && (window.PIXI.utils.TextureCache || window.PIXI.TextureCache)) {
                window.__CUSTOM_SKINS._log('PIXI detected immediately');
                resolveReady(window.PIXI);
                return true;
            }
        } catch (e) { }
        return false;
    }

    // If PIXI already present, resolve now
    if (detectPixiOnce()) {
        // announce readiness to content script
        window.postMessage({ type: 'CUSTOM_SKINS_SHIM_READY' }, '*');
    } else {
        // Hook getContext to detect when renderer is created (covers later initialization)
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        let didHook = false;

        HTMLCanvasElement.prototype.getContext = function (type, attrs) {
            const ctx = originalGetContext.apply(this, arguments);

            try {
                if (!didHook && (typeof type === 'string' && type.indexOf('webgl') === 0)) {
                    didHook = true;
                    // try detect shortly after
                    setTimeout(() => {
                        if (!detectPixiOnce()) {
                            // additionally do a shallow scan of window for PIXI-like objects
                            try {
                                for (const k of Object.keys(window)) {
                                    try {
                                        const v = window[k];
                                        if (v && typeof v === 'object') {
                                            if (v.Texture && v.Renderer && v.utils && v.utils.TextureCache) {
                                                // found one likely PIXI namespace
                                                window.__CUSTOM_SKINS._log('PIXI-like namespace found at window.' + k);
                                                try { window.PIXI = v; } catch (e) { }
                                                if (detectPixiOnce()) break;
                                            }
                                        }
                                    } catch (inner) { }
                                }
                            } catch (e) { }
                        }
                        // if PIXI still not found, keep waiting — we'll not reject here.
                        if (window.PIXI) {
                            window.postMessage({ type: 'CUSTOM_SKINS_SHIM_READY' }, '*');
                        }
                    }, 120);
                }
            } catch (e) { }
            return ctx;
        };
    }

    // When ready, expose helper to insert textures into PIXI.utils.TextureCache
    async function applyAssetsToCache(assetMap) {
        try {
            const PIXI = await window.__CUSTOM_SKINS.ready;
            if (!PIXI) { window.__CUSTOM_SKINS._log('applyAssetsToCache: PIXI missing'); return; }
            const cache = PIXI.utils?.TextureCache || PIXI.TextureCache || {};
            for (const [key, url] of Object.entries(assetMap || {})) {
                try {
                    if (!url) continue;
                    const tex = PIXI.Texture.from(url);
                    cache[key] = tex;
                    window.__CUSTOM_SKINS._log('asset applied', key, url);
                } catch (e) {
                    window.__CUSTOM_SKINS._log('failed to apply asset', key, e && e.message);
                }
            }
        } catch (e) {
            window.__CUSTOM_SKINS._log('applyAssetsToCache outer error', e && e.message);
        }
    }

    // Listen for messages from content script to receive asset map
    window.addEventListener('message', (ev) => {
        if (!ev || ev.source !== window || !ev.data || typeof ev.data.type !== 'string') return;
        const msg = ev.data;
        if (msg.type === 'CUSTOM_SKINS_ASSET_MAP' && msg.assets) {
            // msg.assets: { key: runtimeUrl, ... }
            applyAssetsToCache(msg.assets);
            return;
        }
    }, false);

    // Expose a small runtime API to set mapping for local player and apply immediately
    window.__CUSTOM_LOCAL_SKIN = {
        // mapping: { body?: url, hands?: url, helmet?: url, backpack?: url, tint?: 0x... }
        mapping: {},
        setMapping(obj) {
            this.mapping = Object.assign({}, this.mapping, obj);
            window.__CUSTOM_SKINS._log('local mapping updated', this.mapping);
        },
        async applyNow() {
            try {
                const PIXI = await window.__CUSTOM_SKINS.ready;
                if (!PIXI) { window.__CUSTOM_SKINS._log('applyNow: PIXI missing'); return; }

                // Find a local player object heuristically (search for Player-like objects)
                // Best-effort: search window for objects with bodySprite and an id
                let localPlayer = null;
                try {
                    for (const k of Object.keys(window)) {
                        try {
                            const v = window[k];
                            if (!v || typeof v !== 'object') continue;
                            if (v.bodySprite && v.bodySprite.texture && (v.__id !== undefined || v.id !== undefined || v.isLocal || v.isMe)) {
                                // prefer obvious local markers
                                if (v.isLocal || v.isMe || v.__id === window.__CUSTOM_LOCAL_SKIN__id || v.id === window.__CUSTOM_LOCAL_SKIN__id) {
                                    localPlayer = v; break;
                                }
                                // else keep the first candidate as fallback
                                if (!localPlayer) localPlayer = v;
                            }
                        } catch (inner) { }
                    }
                } catch (e) { }

                if (!localPlayer) {
                    window.__CUSTOM_SKINS._log('applyNow: no local player object found');
                    return;
                }

                const texFrom = u => (typeof u === 'string' ? PIXI.Texture.from(u) : u);
                if (this.mapping.body && localPlayer.bodySprite) localPlayer.bodySprite.texture = texFrom(this.mapping.body);
                if (this.mapping.hands && localPlayer.handLSprite) {
                    const t = texFrom(this.mapping.hands);
                    localPlayer.handLSprite.texture = t;
                    if (localPlayer.handRSprite) localPlayer.handRSprite.texture = t;
                }
                if (this.mapping.helmet && localPlayer.helmetSprite) localPlayer.helmetSprite.texture = texFrom(this.mapping.helmet);
                if (this.mapping.backpack && localPlayer.backpackSprite) localPlayer.backpackSprite.texture = texFrom(this.mapping.backpack);
                if (this.mapping.tint && localPlayer.bodySprite) localPlayer.bodySprite.tint = this.mapping.tint;

                window.__CUSTOM_SKINS._log('applyNow applied to candidate local player', localPlayer);
            } catch (e) {
                window.__CUSTOM_SKINS._log('applyNow error', e && e.message);
            }
        }
    };

})();
