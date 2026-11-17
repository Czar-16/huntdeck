<div align="center">
  <img src="icons/icon-128.png" width="80" alt="Huntdeck icon" />
  <h1>Huntdeck</h1>
  <p><strong>One click for every application.</strong><br>A small space for your next big move.</p>
  <p><img src="https://img.shields.io/badge/version-1.1.1-c3f56b" alt="Version 1.1.1" /> <img src="https://img.shields.io/badge/privacy-local_only-c3f56b" alt="Local only" /> <img src="https://img.shields.io/badge/Chrome-Manifest_V3-6be6ed" alt="Chrome Manifest V3" /></p>
  <p><a href="#installation">Install unpacked</a> · <a href="#usage">Usage</a> · <a href="#privacy-and-backups">Privacy & backups</a> · <a href="CHANGELOG.md">Changelog</a></p>
</div>

## Features

- A 176px daily progress ring, immediate counts, four statistic cards, seven-day chart, and five recent active dates in a scrollable region.
- System, Light, Dark, and three AMOLED presets in the homepage palette; bundled Inter and Space Grotesk; visible keyboard focus and reduced motion.
- Compact, expandable History for entries with both Company and Role, newest first, with 50 noted entries per batch. Every application remains counted and exportable.
- Eight optional tools. Only **Streaks** and **Toolbar badge** start enabled:

| Tool              | What it does                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaks           | Counts active days, with one missed completed day allowed per Monday–Sunday week. Rest days never add to the count; unfinished today does not break it. |
| Toolbar badge     | Displays today's count, including zero. Disable to clear it.                                                                                            |
| Heatmap           | Five Monday-start weeks, with zero, one, two–four, and five-plus intensity levels.                                                                      |
| Quick notes       | Optional Company and Role after logging (120 characters each); both are required to save a note. Edit later in History.                                                 |
| Pipeline          | Applied, Interview, Offer, and Rejected for noted entries, with a summary and status-change timestamps.                                                 |
| Milestones        | Earn 10, 50, 100, and 250 application achievements. Receipts survive history reset.                                                                     |
| CSV import        | Preview additions and duplicate UUIDs, then confirm. Local entries win.                                                                                 |
| Keyboard shortcut | Shows the browser’s actual assigned key and enabled state. Worker and popup logging share the storage queue and repeat protection.                                                                   |

Switching a tool off hides its controls and retains its data. Notifications, weekly summaries, and holiday pauses are future ideas.

## Installation

1. [Clone this repository](https://github.com/Czar-16/huntdeck) or use GitHub's **Code → Download ZIP** and extract it.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Select **Load unpacked** and choose the folder containing `manifest.json`.
4. Pin Huntdeck from Chrome's Extensions menu.

No build step is required. After pulling updates, click **Reload** on Huntdeck's extension card and reopen the popup. This repository does not currently provide a Chrome Web Store listing. Upload packages can be generated with the commands below.

### Firefox package and publishing

Run `npm run package:firefox` to create `dist/huntdeck-1.1.1-firefox.zip` for Firefox **142+**. The archive contains only runtime files, local fonts and their licenses, with `manifest.json` at its root. It uses a Firefox module background script, the permanent add-on ID `huntdeck@czar16`, and a declaration that no data is collected or transmitted. Keep this ID for all future updates.

For a temporary test, visit `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select `dist/firefox/manifest.json`. Temporary installations are removed when Firefox closes. Permanent installation requires Mozilla signing.

To publish on [Mozilla Add-ons](https://addons.mozilla.org/developers/addon/submit/distribution), choose **On this site**, then upload the Firefox ZIP. Select desktop Firefox platforms only (Android has not been tested). After validation, continue, indicate that no separate source package is needed (the packaged JavaScript is readable and has no build step), fill in the listing details and your chosen license, and submit. If asked about data collection, select none. The extension has no accounts, analytics, remote code, or network requests. Mozilla handles signing and review; publication is subject to its approval. See [Mozilla’s submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).

`npm run package:chrome` creates `dist/huntdeck-1.1.1-chrome.zip` with Chrome’s service worker manifest and the same shortcut defaults. The Firefox and Chrome archives are separate; upload the matching archive to each store. Packaging adds no permissions; both request only `storage`.

## Usage

Click **+1 Applied** after sending an application. Counts update immediately; “Saved. Keep going!” appears after a successful storage write. Failed writes roll back the count. The button stays locked during saving and for at least 400ms after clicking. The ring pulses only when a saved application crosses the goal.

**Undo last** removes the entry with the newest timestamp, using storage order to break ties. **Recent activity → View history** opens compact Company/Role summaries with status. Expand a row for recording time, editing, and enabled pipeline controls. Entries without both trimmed fields stay stored, counted, undoable, and included in exports. Expansion and unsaved edits survive refreshes. If Quick notes is enabled, the editor appears below dashboard content. Additional Apply clicks count without replacing the first draft. Save attaches notes to that original application without adding a count; failed saves retain the draft. Skip or closing the popup leaves the count intact (unsaved text is not persisted across popup closure).

Use the **palette beside Settings** for immediate, persistent theme choices. System/Light/Dark use the saved Lime/Aqua/Amber accent. AMOLED Yellow, Red, and Green use black page/cards, white text, gray muted text and borders, and their named bright action fill with black action text. They keep success/streak colors independent and retain your ordinary accent. Choosing an ordinary swatch from AMOLED switches to Dark. Use arrows/Home/End to move between palette choices, Enter/Space to select, and Escape or an outside click to dismiss. Failed writes roll back the selection.

Open **Settings** for the daily goal, optional tools, CSV tools, milestones, and About. New goals accept whole numbers from **1–200**; existing goals up to 999 remain until explicitly edited. Reset requires typing **RESET**. It removes applications while preserving the goal, settings, and earned milestones. Export first if needed.

Default shortcuts on Chrome and Firefox: **Alt+H** opens Huntdeck; **Alt+J** logs an application after enabling **Keyboard shortcut** in Settings. Settings shows the browser’s actual assigned log key or **Not assigned**. Chrome’s **Configure shortcut** opens `chrome://extensions/shortcuts`; Firefox’s control explains how to reach **about:addons → gear menu → Manage Extension Shortcuts**. Existing installations can retain earlier assignments, so set these keys there if needed. Browser or OS conflicts may prevent a suggested key from being assigned. Toolbar counts refresh at startup, extension activity, storage changes, and midnight while the popup is open. **Idle midnight refresh is not guaranteed** because Huntdeck does not use alarms.

Counts group timestamps in your current local timezone. Weeks start on Monday; calendar calculations handle daylight-saving transitions. The original recording-local date remains available in backups even if you change timezones. Huntdeck records clicks and does not inspect websites.

## Screenshots

| Dashboard                                               | Settings & History                                           |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| Screenshot placeholder — daily ring and recent activity | Screenshot placeholder — optional tools and editable entries |

Local browser checks generate screenshots in the ignored `test-results/` folder.

## Privacy and backups

Huntdeck requests only **`storage`**. It has no accounts, analytics, content scripts, host permissions, remote fonts, runtime services, or external requests. README badges above are GitHub documentation images; the installed extension bundles all its resources.

History is stored in `chrome.storage.local` under `applications`, `dailyGoal`, and `settings`, plus `schemaVersion: 2`. Data stays in the current browser profile. It is not synced or automatically backed up. Removing the extension or deleting profile data removes it. The browser's local storage quota applies; failed writes are reported.

Version 1.1 migrates old timestamps to canonical ISO strings through the service worker's serialized queue. It preserves UUIDs, recording dates, order, existing fields, and legacy goals. Migration validates the complete result before one write and is idempotent. A failed migration leaves stored data untouched, blocks edits, and provides **Retry migration** and CSV export of readable entries. Unreadable history is never discarded by a normal save or reset. A newer, unsupported schema opens read-only; update Huntdeck to edit it.

**Export CSV** includes every readable application, oldest first, with the original columns followed by the new fields:

```text
application_id,recorded_local_date,timestamp_iso,company,role,tag,pipeline,status_changed_at
```

Exports use a UTF-8 BOM, quoted fields, escaped quotes, and CRLF row endings. Commas, Unicode, and multiline notes survive round trips. Enable **CSV import** to accept original three-column or extended eight-column Huntdeck exports. Preview does not change history. Confirmation revalidates against current storage and skips duplicate UUIDs, keeping local entries. Malformed files show row-specific errors; files are limited to 5 MB.

Keep CSV backups private: they contain any company names and notes you enter. Exporting readable history cannot recover unreadable records. For damaged storage, keep a copy of the original profile data before attempting repair.

Reminders remain deferred. Adding them later would require `alarms` and `notifications` permissions; neither is requested in this version.

## Tech stack

Vanilla JavaScript ES modules, HTML, CSS, SVG, Manifest V3, and browser local storage. No runtime dependencies or build pipeline.

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

After updating to 1.1.1:

1. Open `chrome://extensions`, click **Reload** on Huntdeck, and reopen its toolbar popup. Confirm About shows **v1.1.1**.
2. In Settings, enable Keyboard shortcut and check the displayed key. If **Not assigned**, click **Configure shortcut** and assign an available combination.
3. Close the popup, focus a normal Chrome tab, and press that combination once. Reopen Huntdeck and confirm one added application.
4. With the popup focused outside inputs, press it once and confirm one added application; hold/repeat rapidly and check duplicate suppression. While typing Company/Role or a goal, the popup handler must not log.
5. Disable Keyboard shortcut and verify the key no longer adds an application. Native command delivery and conflicts depend on Chrome and the OS.

Validate the Firefox package with:

```sh
npm run package:firefox
npx --yes --package=web-ext web-ext lint --source-dir dist/firefox --warnings-as-errors
```

The Firefox smoke check uses Selenium and geckodriver in an isolated profile. Install Selenium separately, then run `python3 tests/firefox-smoke.py`. On a Linux Snap installation, set `FIREFOX_BINARY=/snap/firefox/current/usr/lib/firefox/firefox`, `GECKODRIVER=/snap/bin/geckodriver`, and `FIREFOX_PROFILE_ROOT` to a writable directory under `~/snap/firefox/common/`. It temporarily installs the generated archive and exercises background messaging, counts/reload, themes, shortcut settings, notes, and compact History.

Regenerate icons with `npm run icons` (Python 3 standard library).

## License

Huntdeck is licensed under the [MIT License](LICENSE). Bundled fonts retain their SIL Open Font License notices below.

## Font notices

[Inter](https://github.com/google/fonts/tree/main/ofl/inter) and [Space Grotesk](https://github.com/google/fonts/tree/main/ofl/spacegrotesk) are bundled under the SIL Open Font License 1.1. See [Inter license](fonts/Inter-LICENSE.txt) and [Space Grotesk license](fonts/SpaceGrotesk-LICENSE.txt).
