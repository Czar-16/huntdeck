import { matchesShortcut } from "./lib/shortcut.js";
import {
  STORAGE_KEYS,
  heatmap,
  streak,
  csv,
  localDate,
  millisecondsUntilMidnight,
  statistics,
  validGoal,
} from "./lib/data.js";

const $ = (id) => document.getElementById(id);
let state;
let assignedShortcut = "";
let historyLimit = 50;
let noteId;
let importSource;
let busy = false;
let refreshQueued = false;
let refreshFailed = false;
let refreshVersion = 0;
let midnightTimer;
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok)
    throw new Error(
      response?.error ||
        "Huntdeck could not connect to local storage. Reopen the popup and try again.",
    );
  return response.state;
}

function notify(message = "", error = false) {
  $("message").textContent = message;
  $("message").classList.toggle("error", error);
  $("message").setAttribute("role", error ? "alert" : "status");
}

function controls() {
  const unavailable = !state || busy;
  $("dashboard").setAttribute("aria-busy", String(unavailable));
  $("apply-button").disabled =
    unavailable ||
    state?.historyUnreadable ||
    state?.migrationFailed ||
    state?.readOnly;
  $("undo-button").disabled =
    unavailable ||
    state?.historyUnreadable ||
    state?.migrationFailed ||
    state?.readOnly ||
    !state?.applications.length;
  $("save-goal").disabled =
    unavailable ||
    state?.historyUnreadable ||
    state?.migrationFailed ||
    state?.readOnly;
  $("daily-goal").disabled =
    unavailable ||
    state?.historyUnreadable ||
    state?.migrationFailed ||
    state?.readOnly;
  $("export-button").disabled = unavailable;
  $("reset-button").disabled =
    unavailable ||
    state?.historyUnreadable ||
    state?.migrationFailed ||
    state?.readOnly;
  $("confirm-reset").disabled =
    unavailable || $("reset-text").value !== "RESET";
  $("cancel-reset").disabled = busy;
  const blocked =
    unavailable ||
    state?.historyUnreadable ||
    state?.migrationFailed ||
    state?.readOnly;
  for (const input of document.querySelectorAll(
    "#feature-toggles input, #theme-popover button, #goal-minus, #goal-plus, #import-file, #confirm-import, #quick-note-form input, #quick-note-form button, .history-entry input, .history-entry select, .history-entry button",
  ))
    input.disabled = blocked;
}

function displayDate(date, today) {
  if (date === localDate(today)) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === localDate(yesterday)) return "Yesterday";
  return dateFormat.format(new Date(`${date}T12:00:00`));
}

function render() {
  if (!state) {
    controls();
    return;
  }
  const now = new Date();
  const stats = statistics(state.applications, now);
  const run = streak(state.applications, now);
  $("streak").hidden = !state.settings.streaks || !run;
  $("streak").textContent = `${run} day streak`;
  renderFeatures();
  document.documentElement.dataset.accent = state.settings.accent;
  for (const button of $("theme-popover").querySelectorAll("button")) {
    const selected = button.dataset.appearance
      ? button.dataset.appearance === state.settings.appearance
      : !state.settings.appearance.startsWith("amoled-") && button.dataset.accent === state.settings.accent;
    button.setAttribute("aria-pressed", String(selected));
  }
  $("import-card").hidden = !state.settings.csvImport;
  $("milestones-card").hidden = !state.settings.milestones;
  $("earned-milestones").textContent = state.settings.earnedMilestones.length
    ? state.settings.earnedMilestones
        .map((n) => `${n} applications`)
        .join(" · ")
    : "Your first milestone is 10 applications.";
  $("quick-note").hidden ||= !state.settings.notes;
  $("pipeline-card").hidden = !state.settings.pipeline;
  $("pipeline-summary").replaceChildren(
    ...["Applied", "Interview", "Offer", "Rejected"].map((status) => {
      const segment = document.createElement("div");
      segment.textContent = `${status}: ${state.applications.filter((app) => app.pipeline === status).length}`;
      return segment;
    }),
  );
  $("heatmap-card").hidden = !state.settings.heatmap;
  $("heatmap").replaceChildren(
    ...heatmap(state.applications, now).map((day) => {
      const cell = document.createElement("button");
      cell.className = `heat level-${day.level}`;
      cell.disabled = day.future;
      cell.title =
        cell.ariaLabel = `${day.date}: ${day.count} applications${day.future ? ", future" : ""}`;
      return cell;
    }),
  );
  for (const key of ["total", "today", "week", "month"])
    $(key).textContent = stats[key].toLocaleString();
  $("goal-label").textContent = `${stats.today} / ${state.dailyGoal}`;
  $("ring-count").textContent = stats.today;
  $("goal-fill").style.strokeDashoffset =
    477.522 * (1 - Math.min(stats.today / state.dailyGoal, 1));
  $("goal-progress").setAttribute("aria-valuemax", state.dailyGoal);
  $("goal-progress").setAttribute(
    "aria-valuenow",
    Math.min(stats.today, state.dailyGoal),
  );
  $("goal-progress").setAttribute(
    "aria-valuetext",
    `${stats.today} of ${state.dailyGoal} applications today`,
  );
  $("goal-message").textContent =
    stats.today >= state.dailyGoal
      ? "Goal reached. Every step counts."
      : `${state.dailyGoal - stats.today} more to reach today’s goal. You’ve got this.`;
  if (document.activeElement !== $("daily-goal"))
    $("daily-goal").value = state.dailyGoal;
  const chartTotal = stats.days.reduce((sum, day) => sum + day.count, 0);
  $("chart-total").textContent =
    `${chartTotal} application${chartTotal === 1 ? "" : "s"}`;
  const maximum = Math.max(1, ...stats.days.map((day) => day.count));
  $("chart").replaceChildren(
    ...stats.days.map((day, index) => {
      const column = document.createElement("div");
      column.className = `chart-day${index === 6 ? " is-today" : ""}`;
      column.setAttribute("aria-hidden", "true");
      column.title = `${day.date}: ${day.count} applications`;
      const count = document.createElement("span");
      count.className = "bar-count";
      count.textContent = day.count || "";
      const space = document.createElement("div");
      space.className = "bar-space";
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${Math.max(3, (day.count / maximum) * 44)}px`;
      space.append(bar);
      const label = document.createElement("span");
      label.className = "day-label";
      label.textContent = weekday.format(day.day);
      column.append(count, space, label);
      return column;
    }),
  );
  $("chart").setAttribute(
    "aria-label",
    stats.days
      .map((day) => `${day.date}: ${day.count} applications`)
      .join("; "),
  );
  $("activity").replaceChildren();
  if (!stats.recent.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent =
      "Your first application starts the story. Tap +1 Applied.";
    $("activity").append(empty);
  }
  for (const day of stats.recent) {
    const row = document.createElement("div");
    row.className = "activity-row";
    const icon = document.createElement("span");
    icon.className = "activity-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "↗";
    const info = document.createElement("div");
    info.className = "activity-info";
    const date = document.createElement("div");
    date.className = "activity-date";
    date.textContent = displayDate(day.date, now);
    const times = document.createElement("div");
    times.className = "activity-times";
    times.textContent = day.latest
      .map((app) => timeFormat.format(new Date(app.timestamp)))
      .join(" · ");
    const count = document.createElement("span");
    count.className = "activity-count";
    count.textContent = `+${day.count}`;
    count.setAttribute("aria-label", `${day.count} applications`);
    info.append(date, times);
    row.append(icon, info, count);
    $("activity").append(row);
  }
  $("data-warning").hidden = !state.warnings.length;
  $("data-warning").textContent = state.warnings.join(" ");
  $("retry-migration").hidden = !state.migrationFailed;
  document.documentElement.dataset.theme = state.settings.appearance;
  if (!$("history").hidden) renderHistory();
  controls();
}

async function refresh() {
  if (busy) {
    refreshQueued = true;
    return;
  }
  const version = ++refreshVersion;
  try {
    const next = await request({ type: "getState" });
    if (busy || version !== refreshVersion) return;
    const initial = !state;
    state = next;
    render();
    if (initial || refreshFailed) {
      refreshFailed = false;
      notify();
    }
  } catch (error) {
    if (version === refreshVersion && !busy) {
      refreshFailed = true;
      notify(error.message, true);
    }
  }
}

async function mutate(message, success, optimistic = false) {
  if (busy || !state) return;
  busy = true;
  ++refreshVersion;
  const previous = state;
  const start = Date.now();
  notify();
  if (message.type === "updateSettings")
    state = { ...state, settings: { ...state.settings, ...message.settings } };
  if (optimistic) {
    const timestamp = Date.now();
    state = {
      ...state,
      applications: [
        ...state.applications,
        { id: "pending", timestamp, date: localDate(timestamp) },
      ],
    };
  }
  render();
  try {
    state = await request(message);
    if (["addApplication", "shortcutLog"].includes(message.type) && state.savedId && state.settings.notes && !noteId) {
      noteId = state.savedId;
      $("quick-note-form").replaceChildren(
        ...noteFields({}, async (note) => {
          await mutate({ type: "updateNote", id: noteId, note }, "Note saved.");
        }),
      );
      $("quick-note").hidden = false;
    }
    if (message.type === "updateNote" && message.id === noteId) {
      noteId = undefined;
      $("quick-note").hidden = true;
    }
    if (message.type === "previewImport") {
      $("import-summary").textContent =
        `${state.importPreview.additions} additions · ${state.importPreview.duplicates} duplicates. Existing entries are kept.`;
      $("import-preview").hidden = false;
    }
    if (state.milestone)
      success = `${state.milestone} applications! Milestone earned.`;
    notify(success);
    if (optimistic) {
      setTimeout(() => {
        if ($("message").textContent === success) notify();
      }, 2000);
      if (
        statistics(previous.applications).today < state.dailyGoal &&
        statistics(state.applications).today >= state.dailyGoal
      ) {
        $("goal-progress").classList.remove("pulse");
        void $("goal-progress").offsetWidth;
        $("goal-progress").classList.add("pulse");
      }
    }
  } catch (error) {
    state = previous;
    notify(error.message, true);
  } finally {
    render();
    if (optimistic)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 400 - (Date.now() - start))),
      );
    busy = false;
    controls();
    if (refreshQueued) {
      refreshQueued = false;
      void refresh();
    }
  }
}

function showSettings(open) {
  $("history").hidden = true;
  $("dashboard").hidden = open;
  $("settings").hidden = !open;
  $("settings-button").hidden = open;
  $("theme-button").hidden = open;
  closeTheme();
  $("back-button").hidden = !open;
  $("reset-confirm").hidden = true;
  if (state) $("daily-goal").value = state.dailyGoal;
  (open ? $("back-button") : $("settings-button")).focus();
}

$("settings-button").addEventListener("click", () => showSettings(true));
$("back-button").addEventListener("click", () => showSettings(false));
$("home-link").addEventListener("click", (event) => {
  event.preventDefault();
  showSettings(false);
});
$("apply-button").addEventListener("click", () =>
  mutate({ type: "addApplication" }, "Saved. Keep going!", true),
);
$("undo-button").addEventListener("click", () =>
  mutate({ type: "undoLatest" }, "Latest application removed."),
);
$("goal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const goal = Number($("daily-goal").value);
  if (!validGoal(goal)) {
    notify("Choose a whole number from 1 to 200.", true);
    return;
  }
  void mutate({ type: "updateGoal", goal }, "Daily goal saved.");
});
$("export-button").addEventListener("click", () => {
  if (!state || busy) return;
  const url = URL.createObjectURL(
    new Blob([csv(state.applications)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `huntdeck-${localDate()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify(
    state.historyUnreadable
      ? "CSV prepared with readable entries. Unreadable entries could not be exported."
      : "CSV download prepared.",
  );
});
$("reset-button").addEventListener("click", () => {
  $("reset-text").value = "";
  controls();
  $("reset-confirm").hidden = false;
  $("cancel-reset").focus();
});
$("cancel-reset").addEventListener("click", () => {
  $("reset-confirm").hidden = true;
  $("reset-button").focus();
});
$("confirm-reset").addEventListener("click", async () => {
  await mutate(
    { type: "resetHistory" },
    "Application history reset. Your daily goal is unchanged.",
  );
  $("reset-confirm").hidden = true;
  $("reset-button").focus();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("theme-popover").hidden) {
      closeTheme(true);
      return;
    }
    if (!$("reset-confirm").hidden && !busy) {
      $("reset-confirm").hidden = true;
      $("reset-button").focus();
    } else if (!$("settings").hidden || !$("history").hidden)
      showSettings(false);
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && STORAGE_KEYS.some((key) => key in changes))
    void refresh();
});
window.addEventListener("focus", () => {
  void refresh();
  scheduleMidnight();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    void refresh();
    scheduleMidnight();
  }
});
function scheduleMidnight() {
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(() => {
    void refresh();
    scheduleMidnight();
  }, millisecondsUntilMidnight());
}
controls();
void refresh();
scheduleMidnight();

$("reset-text").addEventListener("input", controls);
$("retry-migration").addEventListener("click", () =>
  mutate({ type: "retryMigration" }, "Migration retried."),
);
for (const [id, delta] of [
  ["goal-minus", -1],
  ["goal-plus", 1],
])
  $(id).addEventListener("click", () => {
    $("daily-goal").value = Math.max(
      1,
      Math.min(200, Number($("daily-goal").value) + delta),
    );
  });

function renderFeatures() {
  $("shortcut-assignment").textContent = `${state.settings.shortcut ? "Enabled" : "Disabled"} · ${assignedShortcut || "Not assigned"}`;
  for (const input of $("feature-toggles").querySelectorAll("input")) {
    input.checked = state.settings[input.name];
    input.disabled =
      busy ||
      state.readOnly ||
      state.historyUnreadable ||
      state.migrationFailed;
  }
}
function addFeature(key, title) {
  const label = document.createElement("label");
  label.className = "toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = key;
  input.id = `feature-${key}`;
  input.addEventListener("change", () =>
    mutate(
      { type: "updateSettings", settings: { [key]: input.checked } },
      "Settings saved.",
    ),
  );
  label.append(document.createTextNode(title), input);
  $("feature-toggles").append(label);
}
addFeature("streaks", "Streaks");

addFeature("badge", "Toolbar badge");

addFeature("heatmap", "Activity heatmap");

addFeature("notes", "Quick notes");
function noteFields(entry, save) {
  const nodes = [];
  for (const [key, limit] of [
    ["company", 120],
    ["role", 120],
  ]) {
    const label = document.createElement("label");
    label.textContent = key[0].toUpperCase() + key.slice(1);
    const input = document.createElement("input");
    input.name = key;
    input.maxLength = limit;
    input.required = true;
    input.value = entry[key] || "";
    label.append(input);
    nodes.push(label);
  }
  const button = document.createElement("button");
  button.type = "submit";
  button.className = "secondary-button";
  button.textContent = "Save note";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    const form = button.closest("form");
    for (const label of nodes) {
      const input = label.lastChild;
      input.setCustomValidity(input.value.trim() ? "" : "Enter a company and role.");
      input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
    }
    if (!form.reportValidity()) return;
    save(
      Object.fromEntries(
        nodes.map((label) => [label.lastChild.name, label.lastChild.value]),
      ),
    );
  });
  return [...nodes, button];
}
$("quick-note-form").addEventListener("submit", (event) => {
  event.preventDefault();
  $("quick-note-form button").click();
});
$("skip-note").addEventListener("click", () => {
  $("quick-note").hidden = true;
  noteId = undefined;
});
$("history-button").addEventListener("click", () => {
  historyLimit = 50;
  $("dashboard").hidden = true;
  $("settings").hidden = true;
  $("history").hidden = false;
  $("settings-button").hidden = true;
  $("theme-button").hidden = true;
  closeTheme();
  $("back-button").hidden = false;
  renderHistory();
  $("back-button").focus();
});
$("load-more").addEventListener("click", () => {
  historyLimit += 50;
  renderHistory();
});
const historyRows = new Map();
function renderHistory() {
  const entries = state.applications
    .map((app, index) => ({ ...app, index }))
    .filter((app) => app.company?.trim() && app.role?.trim())
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || b.index - a.index);
  const ids = new Set(entries.map((entry) => entry.id));
  for (const id of historyRows.keys()) if (!ids.has(id)) historyRows.delete(id);
  const rows = entries.slice(0, historyLimit).map((entry) => {
    let card = historyRows.get(entry.id);
    if (!card) {
      card = document.createElement("details");
      card.className = "settings-card history-entry";
      const summary = document.createElement("summary");
      summary.append(...["company", "role", "status"].map((key) => {
        const span = document.createElement("span");
        span.className = `history-${key}`;
        return span;
      }));
      const time = document.createElement("p");
      time.textContent = `Recorded ${new Date(entry.timestamp).toLocaleString()}`;
      const form = document.createElement("form");
      form.className = "note-form";
      form.append(...noteFields(entry, (note) =>
        mutate({ type: "updateNote", id: entry.id, note }, "Note saved.")));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        form.querySelector("button").click();
      });
      const pipeline = document.createElement("div");
      pipeline.className = "history-pipeline";
      card.append(summary, time, form, pipeline);
      historyRows.set(entry.id, card);
    }
    card.querySelector(".history-company").textContent = entry.company;
    card.querySelector(".history-role").textContent = entry.role;
    card.querySelector(".history-status").textContent = entry.pipeline || "Applied";
    card.querySelector("form").hidden = !state.settings.notes;
    const pipeline = card.querySelector(".history-pipeline");
    pipeline.replaceChildren();
    appendPipeline(pipeline, entry);
    return card;
  });
  // Keep existing nodes connected so focus and native details expansion survive refreshes.
  for (const child of [...$("history-entries").children])
    if (!rows.includes(child)) child.remove();
  rows.forEach((row, index) => {
    if ($("history-entries").children[index] !== row)
      $("history-entries").insertBefore(row, $("history-entries").children[index] || null);
  });
  $("history-empty").hidden = entries.length > 0;
  $("load-more").hidden = entries.length <= historyLimit;
  controls();
}
addFeature("pipeline", "Application pipeline");
function appendPipeline(card, entry) {
  if (
    !state.settings.pipeline ||
    !(entry.pipeline || entry.company || entry.role || entry.tag)
  )
    return;
  const label = document.createElement("label");
  label.textContent = "Pipeline status ";
  const select = document.createElement("select");
  for (const status of ["Applied", "Interview", "Offer", "Rejected"]) {
    const option = document.createElement("option");
    option.value = option.textContent = status;
    select.append(option);
  }
  select.value = entry.pipeline || "Applied";
  select.addEventListener("change", () =>
    mutate(
      { type: "updateStatus", id: entry.id, status: select.value },
      "Status saved.",
    ),
  );
  label.append(select);
  card.append(label);
}

addFeature("milestones", "Milestones");

addFeature("csvImport", "CSV import");
$("import-file").addEventListener("change", async () => {
  $("import-preview").hidden = true;
  const file = $("import-file").files[0];
  if (!file) return;
  if (file.size > 5_000_000) {
    notify("CSV must be under 5 MB.", true);
    return;
  }
  importSource = await file.text();
  await mutate(
    { type: "previewImport", csv: importSource },
    "Review import before confirming.",
  );
});
function cancelImport() {
  importSource = undefined;
  $("import-file").value = "";
  $("import-preview").hidden = true;
}
$("cancel-import").addEventListener("click", cancelImport);
$("confirm-import").addEventListener("click", async () => {
  if (!importSource) return;
  await mutate({ type: "confirmImport", csv: importSource }, "CSV imported.");
  cancelImport();
});

addFeature("shortcut", "Keyboard shortcut");
const assignment = document.createElement("p");
assignment.id = "shortcut-assignment";
assignment.className = "small muted";
const configure = document.createElement("button");
configure.className = "text-button";
configure.textContent = "Configure shortcut ↗";
configure.addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));
$("feature-toggles").append(assignment, configure);
async function readShortcut() {
  try {
    assignedShortcut = (await chrome.commands.getAll()).find((command) => command.name === "log-application")?.shortcut || "";
    if (state) renderFeatures();
  } catch { assignedShortcut = ""; }
}
void readShortcut();
window.addEventListener("focus", () => void readShortcut());
document.addEventListener("keydown", (event) => {
  if (!state?.settings.shortcut || !matchesShortcut(event, assignedShortcut) ||
      event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']")) return;
  event.preventDefault();
  void mutate({ type: "shortcutLog" }, "Saved. Keep going!", true);
});

function closeTheme(focus = false) {
  $("theme-popover").hidden = true;
  $("theme-button").setAttribute("aria-expanded", "false");
  if (focus) $("theme-button").focus();
}
$("theme-button").addEventListener("click", () => {
  if (!$("theme-popover").hidden) return closeTheme(true);
  $("theme-popover").hidden = false;
  $("theme-button").setAttribute("aria-expanded", "true");
  $("theme-popover button[aria-pressed='true']").focus();
});
document.addEventListener("pointerdown", (event) => {
  if (!$("theme-popover").contains(event.target) && !$("theme-button").contains(event.target)) closeTheme();
});
$("theme-popover").addEventListener("keydown", (event) => {
  const buttons = [...$("theme-popover").querySelectorAll("button")].filter((b) => !b.disabled);
  const index = buttons.indexOf(document.activeElement);
  let next;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (index + 1) % buttons.length;
  if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (index + buttons.length - 1) % buttons.length;
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = buttons.length - 1;
  if (next !== undefined && buttons.length) { event.preventDefault(); buttons[next].focus(); }
});
$("theme-popover").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const settings = button.dataset.appearance
    ? { appearance: button.dataset.appearance }
    : { accent: button.dataset.accent, ...(state.settings.appearance.startsWith("amoled-") ? { appearance: "dark" } : {}) };
  void mutate({ type: "updateSettings", settings }, "Theme saved.");
});
