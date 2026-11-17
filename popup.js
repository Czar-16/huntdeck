import {
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
let historyLimit = 50;
let noteId;
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
  $("apply-button").disabled = unavailable || (state?.historyUnreadable || state?.migrationFailed || state?.readOnly);
  $("undo-button").disabled =
    unavailable || (state?.historyUnreadable || state?.migrationFailed || state?.readOnly) || !state?.applications.length;
  $("save-goal").disabled = unavailable || (state?.historyUnreadable || state?.migrationFailed || state?.readOnly);
  $("daily-goal").disabled = unavailable || (state?.historyUnreadable || state?.migrationFailed || state?.readOnly);
  $("export-button").disabled = unavailable;
  $("reset-button").disabled = unavailable || state?.historyUnreadable || state?.migrationFailed || state?.readOnly;
  $("confirm-reset").disabled = unavailable || $("reset-text").value !== "RESET";
  $("cancel-reset").disabled = busy;
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
  $("quick-note").hidden ||= !state.settings.notes;
  $("pipeline-card").hidden = !state.settings.pipeline;
  $("pipeline-summary").replaceChildren(...["Applied","Interview","Offer","Rejected"].map(status => {
    const segment = document.createElement("div"); segment.textContent = `${status}: ${state.applications.filter(app => app.pipeline === status).length}`; return segment;
  }));
  $("heatmap-card").hidden = !state.settings.heatmap;
  $("heatmap").replaceChildren(...heatmap(state.applications, now).map(day => {
    const cell = document.createElement("button"); cell.className = `heat level-${day.level}`;
    cell.disabled = day.future; cell.title = cell.ariaLabel = `${day.date}: ${day.count} applications${day.future ? ", future" : ""}`;
    return cell;
  }));
  for (const key of ["total", "today", "week", "month"])
    $(key).textContent = stats[key].toLocaleString();
  $("goal-label").textContent = `${stats.today} / ${state.dailyGoal}`;
  $("ring-count").textContent = stats.today;
  $("goal-fill").style.strokeDashoffset = 477.522 * (1 - Math.min(stats.today / state.dailyGoal, 1));
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
  $("appearance").value = state.settings.appearance;
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
    if (message.type === "addApplication" && state.settings.notes) {
      noteId = state.savedId;
      $("quick-note-form").replaceChildren(...noteFields({}, async note => {
        await mutate({type:"updateNote", id:noteId, note}, "Note saved.");
      }));
      $("quick-note").hidden = false;
    }
    if (message.type === "updateNote") $("quick-note").hidden = true;
    notify(success);
    if (optimistic) {
      setTimeout(() => { if ($("message").textContent === success) notify(); }, 2000);
      if (statistics(previous.applications).today < state.dailyGoal && statistics(state.applications).today >= state.dailyGoal) {
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
    if (!$("reset-confirm").hidden && !busy) {
      $("reset-confirm").hidden = true;
      $("reset-button").focus();
    } else if (!$("settings").hidden || !$("history").hidden) showSettings(false);
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (
    area === "local" &&
    ["applications", "dailyGoal", "settings"].some((key) => key in changes)
  )
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

$("appearance").addEventListener("change", () => mutate({type:"updateSettings", settings:{appearance:$("appearance").value}}, "Appearance saved."));
$("reset-text").addEventListener("input", controls);
$("retry-migration").addEventListener("click", () => mutate({type:"retryMigration"}, "Migration retried."));
for (const [id, delta] of [["goal-minus",-1],["goal-plus",1]]) $(id).addEventListener("click", () => { $("daily-goal").value = Math.max(1,Math.min(200,Number($("daily-goal").value)+delta)); });

const features = {streaks:"Streaks"};
function renderFeatures() {
  for (const input of $("feature-toggles").querySelectorAll("input")) { input.checked = state.settings[input.name]; input.disabled = busy || state.readOnly || state.historyUnreadable || state.migrationFailed; }
}
function addFeature(key, title) {
  features[key] = title;
  const label = document.createElement("label"); label.className = "toggle";
  const input = document.createElement("input"); input.type = "checkbox"; input.name = key; input.id = `feature-${key}`;
  input.addEventListener("change", () => mutate({type:"updateSettings",settings:{[key]:input.checked}}, "Settings saved."));
  label.append(document.createTextNode(title), input); $("feature-toggles").append(label);
}
addFeature("streaks", "Streaks");

addFeature("badge", "Toolbar badge");

addFeature("heatmap", "Activity heatmap");

addFeature("notes", "Quick notes");
function noteFields(entry, save) {
  const nodes = [];
  for (const [key, limit] of [["company",120],["role",120],["tag",80]]) {
    const label = document.createElement("label"); label.textContent = key[0].toUpperCase()+key.slice(1);
    const input = document.createElement("input"); input.name = key; input.maxLength = limit; input.value = entry[key] || "";
    label.append(input); nodes.push(label);
  }
  const button = document.createElement("button"); button.type = "submit"; button.className = "secondary-button"; button.textContent = "Save note";
  button.addEventListener("click", event => { event.preventDefault(); save(Object.fromEntries(nodes.map(label => [label.lastChild.name,label.lastChild.value]))); });
  return [...nodes, button];
}
$("quick-note-form").addEventListener("submit", event => { event.preventDefault(); $("quick-note-form button").click(); });
$("skip-note").addEventListener("click", () => { $("quick-note").hidden = true; noteId = undefined; });
$("history-button").addEventListener("click", () => {
  historyLimit = 50; $("dashboard").hidden = true; $("settings").hidden = true; $("history").hidden = false;
  $("settings-button").hidden = true; $("back-button").hidden = false; renderHistory(); $("back-button").focus();
});
$("load-more").addEventListener("click", () => { historyLimit += 50; renderHistory(); });
function renderHistory() {
  const entries = state.applications.map((app,index) => ({...app,index})).sort((a,b) => Date.parse(b.timestamp)-Date.parse(a.timestamp) || b.index-a.index);
  $("history-entries").replaceChildren(...entries.slice(0,historyLimit).map(entry => {
    const card = document.createElement("article"); card.className = "settings-card history-entry";
    const time = document.createElement("p"); time.textContent = new Date(entry.timestamp).toLocaleString(); card.append(time);
    if (state.settings.notes) {
      const form = document.createElement("form"); form.className = "note-form";
      form.append(...noteFields(entry, note => mutate({type:"updateNote",id:entry.id,note}, "Note saved.")));
      form.addEventListener("submit", event => { event.preventDefault(); form.querySelector("button").click(); }); card.append(form);
    }
    appendPipeline(card, entry);
    for (const input of card.querySelectorAll("input,button,select")) input.disabled = busy || state.readOnly || state.historyUnreadable || state.migrationFailed;
    return card;
  }));
  $("load-more").hidden = entries.length <= historyLimit;
}
addFeature("pipeline", "Application pipeline");
function appendPipeline(card, entry) {
  if (!state.settings.pipeline || !(entry.pipeline || entry.company || entry.role || entry.tag)) return;
  const label = document.createElement("label"); label.textContent = "Pipeline status ";
  const select = document.createElement("select");
  for (const status of ["Applied","Interview","Offer","Rejected"]) { const option = document.createElement("option"); option.value = option.textContent = status; select.append(option); }
  select.value = entry.pipeline || "Applied";
  select.addEventListener("change", () => mutate({type:"updateStatus", id:entry.id, status:select.value}, "Status saved."));
  label.append(select); card.append(label);
}
