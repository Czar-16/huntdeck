<div align="center">
  <img src="icons/icon-128.png" width="80" alt="Huntdeck icon" />
  <h1>Huntdeck</h1>
  <p><strong>One click for every application.</strong><br>A small space for your next big move.</p>
  <p><img src="https://img.shields.io/badge/version-1.1.0-c3f56b" alt="Version 1.1.0" /> <img src="https://img.shields.io/badge/privacy-local_only-c3f56b" alt="Local only" /> <img src="https://img.shields.io/badge/Chrome-Manifest_V3-6be6ed" alt="Chrome Manifest V3" /></p>
  <p><a href="#installation">Install unpacked</a> · <a href="#usage">Usage</a> · <a href="#privacy-and-backups">Privacy & backups</a> · <a href="CHANGELOG.md">Changelog</a></p>
</div>

## Features

- A 176px daily progress ring, immediate counts, four statistic cards, seven-day chart, and five recent active dates in a scrollable region.
- System, Light, and Dark appearance; bundled Inter and Space Grotesk; visible keyboard focus and reduced motion.
- A dedicated History view, newest first, with 50 entries per batch.
- Nine optional tools. Only **Streaks** and **Toolbar badge** start enabled:

| Tool              | What it does                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaks           | Counts active days, with one missed completed day allowed per Monday–Sunday week. Rest days never add to the count; unfinished today does not break it. |
| Toolbar badge     | Displays today's count, including zero. Disable to clear it.                                                                                            |
| Heatmap           | Five Monday-start weeks, with zero, one, two–four, and five-plus intensity levels.                                                                      |
| Quick notes       | Company, Role, and Tag after saving, with limits of 120, 120, and 80 characters. Edit later in History.                                                 |
| Pipeline          | Applied, Interview, Offer, and Rejected for noted entries, with a summary and status-change timestamps.                                                 |
| Milestones        | Earn 10, 50, 100, and 250 application achievements. Receipts survive history reset.                                                                     |
| CSV import        | Preview additions and duplicate UUIDs, then confirm. Local entries win.                                                                                 |
| Custom accents    | Lime, Aqua, or Amber, independently of appearance.                                                                                                      |
| Keyboard shortcut | Enable **Alt+Shift+A** to log through the same storage queue, with repeat protection.                                                                   |

Switching a tool off hides its controls and retains its data. Notifications, weekly summaries, and holiday pauses are future ideas.

## Installation

1. [Clone this repository](https://github.com/Czar-16/huntdeck) or use GitHub's **Code → Download ZIP** and extract it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the folder containing `manifest.json`.
4. Pin Huntdeck from Chrome's Extensions menu.

No build step is required. After pulling updates, click **Reload** on Huntdeck's extension card and reopen the popup. This repository does not currently provide a Chrome Web Store listing or packaged release.

## Usage

Click **+1 Applied** after sending an application. Counts update immediately; “Saved. Keep going!” appears after a successful storage write. Failed writes roll back the count. The button stays locked during saving and for at least 400ms after clicking. The ring pulses only when a saved application crosses the goal.

**Undo last** removes the entry with the newest timestamp, using storage order to break ties. **Recent activity → View history** opens complete history. If Quick notes is enabled, Save or Skip the optional form after logging; closing the popup leaves the application intact.

Open **Settings** for appearance, optional tools, daily goal, CSV tools, milestones, and About. New goals accept whole numbers from **1–200**; existing goals up to 999 remain until explicitly edited. Reset requires typing **RESET**. It removes applications while preserving the goal, settings, and earned milestones. Export first if needed.

Reassign the optional shortcut at `chrome://extensions/shortcuts`. Chrome or OS conflicts may prevent the suggested key from being assigned. Toolbar counts refresh at startup, extension activity, storage changes, and midnight while the popup is open. **Idle midnight refresh is not guaranteed** because Huntdeck does not use alarms.

Counts group timestamps in your current local timezone. Weeks start on Monday; calendar calculations handle daylight-saving transitions. The original recording-local date remains available in backups even if you change timezones. Huntdeck records clicks and does not inspect websites.

## Screenshots

| Dashboard                                               | Settings & History                                           |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| Screenshot placeholder — daily ring and recent activity | Screenshot placeholder — optional tools and editable entries |

Local browser checks generate screenshots in the ignored `test-results/` folder.

## Privacy and backups

Huntdeck requests only **`storage`**. It has no accounts, analytics, content scripts, host permissions, remote fonts, runtime services, or external requests. README badges above are GitHub documentation images; the installed extension bundles all its resources.

History is stored in `chrome.storage.local` under `applications`, `dailyGoal`, and `settings`, plus `schemaVersion: 2`. Data stays in the current Chrome profile. It is not synced or automatically backed up. Removing the extension or deleting profile data removes it. Chrome's local storage quota applies; failed writes are reported.

Version 1.1 migrates old timestamps to canonical ISO strings through the service worker's serialized queue. It preserves UUIDs, recording dates, order, existing fields, and legacy goals. Migration validates the complete result before one write and is idempotent. A failed migration leaves stored data untouched, blocks edits, and provides **Retry migration** and CSV export of readable entries. Unreadable history is never discarded by a normal save or reset. A newer, unsupported schema opens read-only; update Huntdeck to edit it.

**Export CSV** includes every readable application, oldest first, with the original columns followed by the new fields:

```text
application_id,recorded_local_date,timestamp_iso,company,role,tag,pipeline,status_changed_at
```

Exports use a UTF-8 BOM, quoted fields, escaped quotes, and CRLF row endings. Commas, Unicode, and multiline notes survive round trips. Enable **CSV import** to accept original three-column or extended eight-column Huntdeck exports. Preview does not change history. Confirmation revalidates against current storage and skips duplicate UUIDs, keeping local entries. Malformed files show row-specific errors; files are limited to 5 MB.

Keep CSV backups private: they contain any company names and notes you enter. Exporting readable history cannot recover unreadable records. For damaged storage, keep a copy of the original profile data before attempting repair.

Reminders remain deferred. Adding them later would require `alarms` and `notifications` permissions; neither is requested in this version.

## Tech stack

Vanilla JavaScript ES modules, HTML, CSS, SVG, Manifest V3, and Chrome local storage. No runtime dependencies or build pipeline.

```text
huntdeck/
├── manifest.json          # Extension, worker, and shortcut declarations
├── background.js          # Serialized requests, badge, command listener
├── popup.html/css/js      # Dashboard, settings, History
├── lib/data.js            # Validation, calendars, streaks, CSV
├── lib/store.js           # Migration and authoritative mutations
├── fonts/                 # Local fonts and OFL notices
├── icons/                 # Bundled PNG icons
├── scripts/               # Reproducible icon generator
└── tests/                 # Node and isolated Chromium checks
```

## Development and tests

Node.js 20.11+ is required for tests. The extension itself needs no Node tooling.

```sh
npm test
# Optional temporary browser tooling:
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

Node tests cover migration preservation/failure/retry, ISO timestamps, legacy goals, serialized writes, corrupted history protection, calendar boundaries/DST/timezones, streak rest days, heatmap boundaries, notes/status changes, milestone receipts, CSV round trips/deduplication, and shortcut repeat protection.

Browser checks load the real extension into an isolated Chromium profile and open the popup document at 380×600. They exercise optimistic updates, write rollback, settings, toggles, themes/accents, keyboard focus, reduced motion, CSV tools, History editing, badge updates, the shortcut handler path, and persistence after browser restart. They check contrast, overflow, and absence of external HTTP requests. OS-level shortcut delivery and toolbar popup placement should also be checked manually after installation.

Regenerate icons with `npm run icons` (Python 3 standard library).

## Font notices

[Inter](https://github.com/google/fonts/tree/main/ofl/inter) and [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk) are bundled under the SIL Open Font License 1.1. See [Inter license](fonts/Inter-LICENSE.txt) and [Space Grotesk license](fonts/SpaceGrotesk-LICENSE.txt).
