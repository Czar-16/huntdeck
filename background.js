import { extension } from "./lib/extension.js";
import { statistics } from "./lib/data.js";
import { createStore } from "./lib/store.js";

const dispatch = createStore(extension.storage.local);
extension.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== extension.runtime.id) return false;
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
    await extension.action.setBadgeBackgroundColor({ color: "#c3f56b" });
    await extension.action.setBadgeTextColor({ color: "#14210b" });
    await extension.action.setBadgeText({
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
extension.runtime.onStartup.addListener(refreshBadge);
extension.runtime.onInstalled.addListener(refreshBadge);
extension.storage.onChanged.addListener((changes, area) => {
  if (area === "local") refreshBadge();
});
refreshBadge();

extension.commands.onCommand.addListener((command) => {
  if (command === "log-application")
    dispatch({ type: "shortcutLog" })
      .then(updateBadge)
      .catch((error) => console.warn(error.message));
});
