import test from "node:test";
import assert from "node:assert/strict";
import { matchesShortcut } from "../lib/shortcut.js";

test("matches the assigned combination with exact modifiers and rejects repeats", () => {
  const event = { key: "A", code: "KeyA", altKey: true, shiftKey: true };
  assert.equal(matchesShortcut(event, "Alt+Shift+A"), true);
  for (const changed of [{ repeat: true }, { ctrlKey: true }, { shiftKey: false }, { isComposing: true }, { key: "b", code: "KeyB" }])
    assert.equal(matchesShortcut({ ...event, ...changed }, "Alt+Shift+A"), false);
  assert.equal(matchesShortcut(event, ""), false);
  assert.equal(matchesShortcut({ key: "k", metaKey: true, shiftKey: true }, "Command+Shift+K"), true);
});
