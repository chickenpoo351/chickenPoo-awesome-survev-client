console.log("%c[Survev Patch] content.js loaded", "color: orange; font-weight: bold;");

function applyPlaceholders() {
  if (!window.PIXI || !window.PIXI.TextureCache) {
    console.warn("[Survev Patch] PIXI not ready yet.");
    return false;
  }

  console.log("%c[Survev Patch] PIXI found — applying placeholder skins.", "color: lime;");
  const replacements = {
    "player-base-01.img": chrome.runtime.getURL("skins/body.webp"),
    "player-helmet-moon.img": chrome.runtime.getURL("skins/helmet.webp")
  };

  let success = false;
  for (const [key, url] of Object.entries(replacements)) {
    const tex = PIXI.TextureCache[key];
    if (!tex) {
      console.warn("⚠️ texture key not found yet:", key);
      continue;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = () => {
      try {
        tex.baseTexture.resource.source = img;
        tex.baseTexture.update();
        console.log("✔ replaced", key);
      } catch (e) {
        console.error("Failed to replace", key, e);
      }
    };
    success = true;
  }
  return success;
}

// --- Poll until cache is populated and replacements succeed ---
(function wait() {
  try {
    if (window.PIXI && window.PIXI.TextureCache) {
      const size = Object.keys(window.PIXI.TextureCache).length;
      if (size > 50) {
        if (applyPlaceholders()) return;
      }
    }
  } catch (e) {
    console.warn("[Survev Patch] wait loop error", e);
  }
  setTimeout(wait, 1000);
})();
