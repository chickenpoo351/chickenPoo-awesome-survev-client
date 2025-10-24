// content.js (extension content script - runs in extension isolated world)
// Purpose: inject pageHook.js into page context as inline text, then relay chrome.runtime.getURL() asset URLs to the page.

(async function () {
  // Utility: fetch a file packaged inside the extension
  async function fetchExtensionFile(path) {
    const url = chrome.runtime.getURL(path);
    const resp = await fetch(url);
    return resp.text();
  }

  // Inject pageHook.js as an external file so CSP doesn’t block it
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('pageHook.js');
    script.onload = () => script.remove(); // clean up after it runs
    (document.head || document.documentElement).appendChild(script);
    console.log('[CS] injected pageHook.js as external file');
  } catch (e) {
    console.error('[CS] failed to inject pageHook.js', e);
    return;
  }


  // Listen for messages from the page hook
  window.addEventListener('message', (ev) => {
    if (!ev || ev.source !== window || !ev.data || typeof ev.data.type !== 'string') return;
    const msg = ev.data;

    if (msg.type === 'CUSTOM_SKINS_SHIM_READY') {
      console.log('[CS] page hook ready, requesting asset mapping supply');

      // Provide asset mapping here. Edit these paths to your packaged images.
      // Key = texture cache key used by the game. Value = extension path under the extension folder.
      const mapping = {
        // Example for Moderatr outfit (adjust filenames to match your extension assets)
        "player-base-outfitDC.img": "skins/moderatr/player-base-outfitDC.svg",
        "player-hands-02.img": "skins/moderatr/player-hands-02.svg",
        "player-feet-02.img": "skins/moderatr/player-feet-02.svg",
        "player-circle-base-02.img": "skins/moderatr/player-circle-base-02.svg",
        "loot-shirt-outfitMod.img": "skins/moderatr/loot-shirt-outfitMod.svg"
      };

      // Convert mapping's values to chrome.runtime.getURL and send back
      const assets = {};
      for (const [k, p] of Object.entries(mapping)) {
        try { assets[k] = chrome.runtime.getURL(p); } catch (e) { assets[k] = p; }
      }
      window.postMessage({ type: 'CUSTOM_SKINS_ASSET_MAP', assets }, '*');
      return;
    }

    // Page requests runtime URLs for specific paths (optional)
    if (msg.type === 'CUSTOM_SKINS_REQUEST_RUNTIME_URL' && msg.path && msg.id) {
      const url = chrome.runtime.getURL(msg.path);
      window.postMessage({ type: 'CUSTOM_SKINS_RUNTIME_URL', id: msg.id, url }, '*');
      return;
    }

    // Debug/info messages forwarded from pageHook
    if (msg.type === 'CUSTOM_SKINS_LOG') {
      console.log('[PAGEHOOK]', msg.msg);
      return;
    }
  }, false);

})();
