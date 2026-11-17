import { createStore } from "./lib/store.js";

const dispatch = createStore(chrome.storage.local);
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  dispatch(message).then(
    (state) => sendResponse({ ok: true, state }),
    (error) => sendResponse({ ok: false, error: error.message }),
  );
  return true;
});
