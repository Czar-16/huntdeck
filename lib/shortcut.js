// Chrome returns platform-specific shortcut labels from commands.getAll().
export function matchesShortcut(event, shortcut) {
  if (!shortcut || event.repeat || event.isComposing) return false;
  const parts = shortcut.toLowerCase().replaceAll("⌘", "command+").replaceAll("⌥", "alt+").replaceAll("⇧", "shift+").replaceAll("⌃", "ctrl+").split("+").map((part) => part.trim()).filter(Boolean);
  const modifiers = new Set(parts.slice(0, -1));
  const key = parts.at(-1);
  return Boolean(event.ctrlKey) === (modifiers.has("ctrl") || modifiers.has("control") || modifiers.has("macctrl")) &&
    Boolean(event.altKey) === (modifiers.has("alt") || modifiers.has("option")) &&
    Boolean(event.shiftKey) === modifiers.has("shift") &&
    Boolean(event.metaKey) === (modifiers.has("command") || modifiers.has("cmd") || modifiers.has("meta")) &&
    (event.key.toLowerCase() === key || event.code?.toLowerCase() === `key${key}` || event.code?.toLowerCase() === `digit${key}`);
}
