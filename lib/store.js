import { STORAGE_KEYS, normalize, validGoal, localDate } from "./data.js";

const TYPES = new Set([
  "getState",
  "addApplication",
  "undoLatest",
  "updateGoal",
  "resetHistory",
]);

export function createStore(
  storage,
  { now = () => Date.now(), uuid = () => crypto.randomUUID() } = {},
) {
  let queue = Promise.resolve();
  async function execute(message) {
    if (
      !message ||
      typeof message !== "object" ||
      Array.isArray(message) ||
      !TYPES.has(message.type)
    )
      throw new Error("Unknown Huntdeck request.");
    const allowed = message.type === "updateGoal" ? ["type", "goal"] : ["type"];
    if (Object.keys(message).some((key) => !allowed.includes(key)))
      throw new Error("Malformed Huntdeck request.");
    if (message.type === "updateGoal" && !validGoal(message.goal))
      throw new Error("Choose a whole number from 1 to 999.");
    let raw;
    try {
      raw = await storage.get(STORAGE_KEYS);
    } catch {
      throw new Error(
        "Could not read local storage. Reopen Huntdeck and try again.",
      );
    }
    const state = normalize(raw);
    if (message.type === "getState") return state;
    if (state.historyUnreadable && message.type !== "resetHistory")
      throw new Error(
        "History contains unreadable data. Export valid entries, then explicitly reset history in Settings.",
      );
    if (message.type === "addApplication") {
      const timestamp = now();
      state.applications.push({
        id: uuid(),
        timestamp,
        date: localDate(timestamp),
      });
    }
    if (message.type === "undoLatest" && state.applications.length) {
      let latest = 0;
      state.applications.forEach((app, index) => {
        if (app.timestamp >= state.applications[latest].timestamp)
          latest = index;
      });
      state.applications.splice(latest, 1);
    }
    if (message.type === "updateGoal") state.dailyGoal = message.goal;
    if (message.type === "resetHistory") state.applications = [];
    const saved = Object.fromEntries(
      STORAGE_KEYS.map((key) => [key, state[key]]),
    );
    try {
      await storage.set(saved);
    } catch {
      throw new Error(
        "Could not save to local storage. Your change was not saved. Please try again.",
      );
    }
    return normalize(saved);
  }
  return (message) => {
    const operation = queue.then(() => execute(message));
    queue = operation.catch(() => {});
    return operation;
  };
}
