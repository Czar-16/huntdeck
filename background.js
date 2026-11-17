import { statistics } from "./lib/data.js";
import { createStore } from "./lib/store.js";

const dispatch = createStore(chrome.storage.local);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  dispatch(message).then(
    (state) => {
      void updateBadge(state);
      sendResponse({ ok: true, state });
    },
    (error) => sendResponse({ ok: false, error: error.message }),
  );
  return true;
});

async function updateBadge(state) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#c3f56b" });
    await chrome.action.setBadgeTextColor({ color: "#14210b" });
    await chrome.action.setBadgeText({
      text: state.settings.badge
        ? String(statistics(state.applications).today)
        : "",
    });
  } catch (error) {
    console.warn("Badge update failed", error);
  }
}
function refreshBadge() {
  dispatch({ type: "getState" })
    .then(updateBadge)
    .catch((error) => console.warn(error.message));
}
chrome.runtime.onStartup.addListener(refreshBadge);
chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") refreshBadge();
});
refreshBadge();

chrome.commands.onCommand.addListener((command) => {
  if (command === "log-application")
    dispatch({ type: "shortcutLog" })
      .then(updateBadge)
      .catch((error) => console.warn(error.message));
});
