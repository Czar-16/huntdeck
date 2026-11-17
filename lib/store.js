import { STORAGE_KEYS, normalize, validGoal, localDate, DEFAULT_SETTINGS, previewImport } from "./data.js";

const TYPES = new Set([
  "getState",
  "retryMigration",
  "updateSettings",
  "updateNote",
  "updateStatus",
  "previewImport",
  "confirmImport",
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
    const allowed = message.type === "updateGoal" ? ["type", "goal"] : message.type === "updateSettings" ? ["type", "settings"] : message.type === "updateNote" ? ["type", "id", "note"] : message.type === "updateStatus" ? ["type", "id", "status"] : ["previewImport","confirmImport"].includes(message.type) ? ["type", "csv"] : ["type"];
    if (Object.keys(message).some((key) => !allowed.includes(key)))
      throw new Error("Malformed Huntdeck request.");
    if (message.type === "updateGoal" && !validGoal(message.goal))
      throw new Error("Choose a whole number from 1 to 200.");
    let raw;
    try {
      raw = await storage.get(STORAGE_KEYS);
    } catch {
      throw new Error(
        "Could not read local storage. Reopen Huntdeck and try again.",
      );
    }
    let state = normalize(raw);
    const save = async (value) => {
      try { await storage.set(Object.fromEntries(STORAGE_KEYS.map(key => [key, value[key]]))); }
      catch { throw new Error("Could not save to local storage. Your change was not saved. Please try again."); }
    };
    if (state.readOnly) {
      state.warnings.push("This history uses a newer schema. Open read-only; update Huntdeck to edit it.");
      if (!["getState", "retryMigration"].includes(message.type)) throw new Error("Future schema is read-only.");
      return state;
    }
    if (raw.schemaVersion !== 2) {
      try {
        if (state.historyUnreadable) throw new Error("History contains unreadable records.");
        const check = normalize(state);
        if (check.historyUnreadable || check.applications.length !== (raw.applications?.length ?? 0)) throw new Error("Migration validation failed.");
        await save(state);
      } catch (error) {
        state.migrationFailed = true;
        state.warnings.push("Migration failed: " + error.message + " Retry migration or export readable history.");
        if (!["getState", "retryMigration"].includes(message.type)) throw new Error(state.warnings.join(" "));
        return state;
      }
    }
    if (["getState", "retryMigration"].includes(message.type)) return state;
    if (state.historyUnreadable) throw new Error("History contains unreadable data; mutations are blocked. Export readable history.");
    if (message.type === "updateSettings") {
      if (!message.settings || typeof message.settings !== "object" || Array.isArray(message.settings)) throw new Error("Invalid settings.");
      for (const [key, value] of Object.entries(message.settings)) {
        if (!(key in DEFAULT_SETTINGS) || (key === "appearance" ? !["system", "light", "dark"].includes(value) : key === "accent" ? !["lime", "aqua", "amber"].includes(value) : typeof value !== "boolean")) throw new Error("Invalid setting: " + key);
      }
      Object.assign(state.settings, message.settings);
    }
    if (message.type === "updateNote") {
      if (!state.settings.notes) throw new Error("Quick notes are disabled.");
      const entry = state.applications.find(app => app.id === message.id);
      if (!entry) throw new Error("Application no longer exists.");
      const note = message.note;
      if (!note || typeof note !== "object" || Array.isArray(note) || Object.keys(note).some(k => !["company","role","tag"].includes(k))) throw new Error("Invalid note.");
      for (const [key, limit] of [["company",120],["role",120],["tag",80]]) {
        if (typeof note[key] !== "string" || note[key].length > limit) throw new Error(`Invalid ${key} (maximum ${limit} characters).`);
      }
      Object.assign(entry, note);
      if (!entry.pipeline && (note.company || note.role || note.tag)) { entry.pipeline = "Applied"; entry.status_changed_at = new Date(now()).toISOString(); }
    }
    if (message.type === "updateStatus") {
      if (!state.settings.pipeline) throw new Error("Pipeline is disabled.");
      const entry = state.applications.find(app => app.id === message.id);
      if (!entry || !(entry.pipeline || entry.company || entry.role || entry.tag)) throw new Error("Add a note first.");
      if (!["Applied","Interview","Offer","Rejected"].includes(message.status)) throw new Error("Invalid pipeline status.");
      if (entry.pipeline !== message.status) { entry.pipeline = message.status; entry.status_changed_at = new Date(now()).toISOString(); }
    }
    if (["previewImport","confirmImport"].includes(message.type)) {
      if (!state.settings.csvImport) throw new Error("CSV import is disabled.");
      const preview = previewImport(message.csv, state.applications);
      if (message.type === "previewImport") return {...state, importPreview:{additions:preview.additions.length, duplicates:preview.duplicates}};
      state.applications.push(...preview.additions);
    }
    let savedId;
    if (message.type === "addApplication") {
      const timestamp = now();
      savedId = uuid();
      state.applications.push({
        id: savedId,
        timestamp: new Date(timestamp).toISOString(),
        date: localDate(timestamp),
      });
    }
    if (message.type === "undoLatest" && state.applications.length) {
      let latest = 0;
      state.applications.forEach((app, index) => {
        if (Date.parse(app.timestamp) >= Date.parse(state.applications[latest].timestamp))
          latest = index;
      });
      state.applications.splice(latest, 1);
    }
    if (message.type === "updateGoal") state.dailyGoal = message.goal;
    if (message.type === "resetHistory") state.applications = [];
    const newMilestones = [10,50,100,250].filter(n => state.applications.length >= n && !state.settings.earnedMilestones.includes(n));
    state.settings.earnedMilestones.push(...newMilestones);
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
    return {...normalize(saved), savedId, milestone: message.type === "addApplication" && state.settings.milestones ? newMilestones.at(-1) : undefined};
  }
  return (message) => {
    const operation = queue.then(() => execute(message));
    queue = operation.catch(() => {});
    return operation;
  };
}
