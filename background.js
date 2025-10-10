// background.js
chrome.runtime.onInstalled.addListener(updateRules);
chrome.runtime.onStartup.addListener(updateRules);

async function updateRules() {
  try {
    // Get existing rule IDs
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const ids = existing.map(r => r.id);
    if (ids.length) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
    }

    // Add our redirect rule
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: "redirect",
            redirect: { extensionPath: "/r1_z_2yJ.patched.js" }
          },
          condition: {
            urlFilter: "r1_z_2yJ.js",
            resourceTypes: ["script"]
          }
        }
      ]
    });

    console.log("[Survev Patch] Redirect rule installed.");
  } catch (e) {
    console.error("[Survev Patch] Failed to update redirect rule:", e);
  }
}
