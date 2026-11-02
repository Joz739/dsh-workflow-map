# dsh-workflow-map

English · [**简体中文**](README.md)

A DeepSeek Harness plugin that renders the current session as an interactive step-by-step workflow map.

> **Host requirement**
>
> - **DSH kernel**: `engines.dsh` = `>=0.2.1-rc.1 <0.3.0-0`, covering the whole `0.2.1` series (`0.2.1-rc.1` through `0.2.1-rc.5`) and the `0.2.1` release.
> - **Node.js**: `>=20` (`engines.node`).
> - Host packages are declared as `peerDependencies` (all optional peers, same range as `engines.dsh`); the host is not bundled. Hosts below `0.2.1-rc.1`, or at `0.3.0` and above, are outside the declared range.
> - Range note: `>=0.2.1-rc.1 <0.3.0-0` carries an explicit prerelease tag on the `0.2.1` tuple, which is what makes it match `0.2.1-rc.x`; a start of `>=0.1.0-rc.1` silently excludes every `0.2.1` prerelease. The upper bound `<0.3.0-0` sorts below every prerelease of `0.3.0`, so the whole `0.3` line (including `0.3.0-rc.1`) stays outside the range.

Per-version method and result:

| Host version | How it was checked | Result |
|---|---|---|
| `0.2.1-rc.3` | Run on a real host: plugin load, panel injection, view routes | Baseline |
| `0.2.1-rc.1` / `0.2.1-rc.2` / `0.2.1-rc.4` / `0.2.1-rc.5` | Cross-version contract check: closure metadata, per-file SHA-256, contract anchor windows | All nine contract points unchanged |

A contract check is not a real-host run: the last four versions were compared against published artifacts and contract anchors only, and never booted. Method and evidence: [`docs/host-compatibility.md`](docs/host-compatibility.md).

Three entry points share one data source and one set of components: the sidebar panel item
(`sidebar.panellist`), the main content area (`main`), and the session tab bar (`conversation.view`).
The panel folds session events into a step sequence, showing each step's status, progress, tool calls
and file operations, and can inject prompts into the next step of a running session.

![Workflow map main screen preview (dark theme): serial main flow, type interfaces on both sides, details on the right page](docs/screenshots/01-main-dark.png)

*Main screen (dark): the selected sidebar entry on the left, the serial main flow in the centre (one unit
card per step, round interfaces on both sides for tool/file types, the running unit highlighted with a
flowing frame), the step detail page on the right, and the persistent injection bar at the bottom.*

### Screenshots (full preview)

| | |
|---|---|
| ![Main screen full preview (light theme)](docs/screenshots/02-main-light.png) | ![Running step preview: flowing gradient frame](docs/screenshots/03-running-step.png) |
| **Main screen, light theme**: same layout, colours follow the host theme | **Running unit**: the flowing frame marks "calling right now" |
| ![Step detail preview: type list and call records on the right page](docs/screenshots/04-step-detail.png) | ![Hot inject preview: queue a prompt for the next step](docs/screenshots/05-hot-inject.png) |
| **Step detail**: type list, call arguments and result summary for that step | **Hot inject**: queue a prompt for the next step, revocable before it is claimed |
| ![Settings panel preview: palette, motion, detail depth and export](docs/screenshots/06-settings.png) | |

All six are offscreen renders of the interface and contain no real session content.

![license](https://img.shields.io/badge/license-MIT-blue)
![platform](https://img.shields.io/badge/platform-DeepSeek%20Harness-brightgreen)
![node](https://img.shields.io/badge/node-%E2%89%A520-informational)
![version](https://img.shields.io/badge/version-1.0.0-success)

---

## 1. What problem it solves

Long tasks grow session logs to thousands of events. Answering "which step is it on", "what did this
step do" and "how much is done" means scrolling back through those logs. This plugin presents those
three facts on one screen, with every data source and decision rule traceable.

### Layout

```
┌──────────────────────────────┬───────────────────┐
│ session         4/10 · 46%                 ⚙ │
├──────────────────────────────┼───────────────────┤
│ ◯─┐  01/10  skeleton and registration │  step 5 detail       │
│   │   ▓▓▓▓▓▓▓▓▓▓ 100% reported │  ──────────────── │
│   │                            │  files this step used │
│ ◯─┘  02/10  host projection      │  ● md type   4 calls │
│   │   ▓▓▓▓▓▓▓▓▓▓ 100% reported │  ● js type   2 calls │
│   │                            │  ● pwsh type 2 calls │
│ ◯─┐  05/10  browser shell       <- running (highlighted) │
│   │   ▓▓▓▓▓░░░░░ ~58% estimated │  step 5 detail      │
│   │   estimated 3 min ago       │  what it delivered  │
│   │                            │  ● done              │
│ ◯─┘  06/10  step cards and rail │  12 tools 12 files │
│       ▓▓▓░░░░░░░ ~36% estimated │  ──────────────── │
│                                │  inject [........] │
└──────────────────────────────┴───────────────────┘
   main flow (one unit per step, round type interfaces on both sides)   right page (opens on click)
```

> Diagram, not a screenshot; see the screenshot above for the real UI.

---

## 2. Capabilities

The four capabilities below map onto four regions of the UI: injection (header button and the right
page input), progress (the rail under each card), layout (main flow and side interfaces), and state
encoding (animation and colour).

### 2.1 Hot injection (steer / unsteer)

**Write semantics**: `POST /dsh-workflow/steer` calls the host's `agent.steer(message)`; the message
enters the session inbox queue `next-step` and is claimed by the next step **after the current turn
ends**. The call does not trigger `cancel`, so the running turn is not interrupted.

| Endpoint | Method | Semantics |
|---|---|---|
| `/dsh-workflow/steer` | POST | Write one prompt to `next-step`; the response returns the generated `messageId` |
| `/dsh-workflow/unsteer` | POST | Call `agent.inbox.remove()` with the `messageId`, removing a message that is **not yet claimed** |

**State determination** (mutually exclusive, all derived from the log, never guessed by the UI):

| State | Determined by |
|---|---|
| Awaiting pickup | `agent/inbox/spliced` exists and no `user/message` with the same id |
| Picked up | A `user/message` with the same id exists (the turn claimed it) |
| Revoked | `agent/inbox/spliced { outcome: "canceled" }` exists and the id was never claimed |

HTTP 200 only means the message reached the inbox; it does **not** mean the session has read it. The
"awaiting pickup" versus "picked up" distinction comes from the log events above. A revoke's durable
record is the splice **position**, not the message id, so the fold keeps an inbox ledger (replaying
splices with the host's own `inboxProjectionDefinition` semantics) to identify which row was removed.

Failure semantics: document-level errors always return JSON and never throw into the HTTP layer.
Common codes: `400` missing field / non-JSON body, `404` unknown session, `409` session not running or
message already claimed, `413` text over 2000 chars or body over 64 KiB, `503` the host does not expose
the capability.

### 2.2 Progress estimation

Each step's percentage is resolved by the following **priority** (`percentFor` in `src/fold.mjs`):
| Priority | Source | Rule | Cap |
|---|---|---|---|
| 1 | Model self-report `model` | The most recent `stepProgress/report` percentage for that step | 99 |
| 2 | Time baseline `baseline` | `elapsed / median(finished-step durations in this session) * 100` | 90 |
| 3 | Plan ordinal `baseline:steps` | Cold start with `current step / total steps * 100` when no finished-step duration exists yet (plan of at least 2 steps, not the first one) | 90 |
| - | `none` | None of the three is available | No number shown |

Constraint: an unfinished step never shows 100 %; a finished (done or failed) step is pinned to 100 %; a step whose turn has
ended and that is still waiting for the next turn shows no number, rather than 100 %.

**The todo table's global completion ratio is not a per-step percentage.** It is finished rows over all rows - a fact about
the session, not a measurement of the step the rail is drawn under. Feeding it into a step hands a total to a part: every
row of a half-finished checklist reads the same number, and it moves only when the table is rewritten. Measured over 167
session logs, 23 of 38 running steps carried exactly their session's completion ratio (recounted with the
current fold: 25 of 39 - the two samples were taken at different times, same direction and magnitude). A model
self-report and the time
baseline are both quantities about this step, so those are the only two routes; the high-water record `step.maxPercent` is
still written, floors the two extrapolation routes only, never raises a self-report, and takes no part in a finished step's
value. When `foldTodos` takes a finished row back to `in_progress`, or demotes it to `pending`, it clears `percent` and
`maxPercent` and resets `startedAt`: a finished record's number belongs to that closure, not to the row that reopens it.

**`awaitingNextTurn`**: the todo table still writes that row as `in_progress`, but the turn it was working in has already
ended through `turn/end` and no `turn/start` has opened the next one (PAE continues this step in the next turn). The panel
then marks it "waiting for the next turn" and the rail publishes no number. It is a per-STEP field; whether a turn is open
right now is the session-level `view.running`, a different question, and the view publishes both.

A second line under the rail reads `estimated N minutes ago`, i.e. `view.asOf - step.lastEstimateAt`.
It describes how **stale** the number is, distinguishing "being updated" from "unchanged for a long time".
The line is not rendered when the field is absent.

### 2.3 Single-page layout

One vertical main flow, one unit per step; each unit carries round interfaces on both sides, one per
tool or file type.

| Dimension | Rule |
|---|---|
| Side assignment | Read-type (`read` / `grep` / `glob` / path queries) on the left; write and execute (`edit` / `write` / `pwsh`) on the right |
| Capacity per side | 2 interfaces |
| Overflow | Extra types are not drawn; the unit states "N more types are not drawn on the sides" |
| Connector | A straight line between interface and unit |
| Details | Click an interface -> the right page lists that type's calls; click a unit -> the right page shows that step's record |

A single page was chosen over columns for continuity: switching steps in a two-column layout moves two
scroll regions at once, whereas here the main flow does not shift when the right page opens or closes.

### 2.4 Visual state encoding

The running unit and the single connector pointing at it use a flowing gradient; every other unit stays
statically filled even when its status is `running` (for example, when it is not the live one). Durations
and thresholds live in `src/client/theme.js`:

| Element | Implementation | Period |
|---|---|---|
| Running unit frame | `::after` multi-stop linear gradient plus a position animation | 2.6 s |
| Running unit ring | Opacity pulse | 1.6 s |
| Progress fill | Background position | 1.5 s |
| Activity dots | Three dots breathing out of phase | 1.2 s |

`data-motion="static"` (the "reduce motion" setting, or the OS `prefers-reduced-motion: reduce`) sets
every animation inside the panel to `none`, and `document.getAnimations()` returns an empty set;
`data-idle="1"` (session idle) sets animations to `paused` while keeping the current frame. The two are
not the same thing.

### 2.5 One implementation, three seats

All three entries register the same component, the same polling and the same preferences record - there is
no second implementation. The session-tab entry additionally carries a box-less marker so a `:has()` rule
can collapse the host's composer on that page; switching back unmounts the view and the composer returns.

---

## 3. Installation

> **Prerequisites for installing from the market**: two conditions must both hold. (1) `dsh-workflow-map`
> is published on npm (the current version is the `version` field in `package.json`). (2) The `awesome-dsh-plugin` PR is merged **and** the market index
> (`dsh-plugin-catalog`, served via jsDelivr) has refreshed and picked up the entry.
> Once both hold, install from the **DSH market** (Plugins > Discover) by searching `workflow`, no terminal needed.
> If it is not indexed yet, use the command line below (3.2) to install the same package; both routes are equivalent.

### 3.1 Install through the agent

```
install dsh-workflow-map with plugin_manager, path is <absolute path to the plugin>
```

A returned `application: applied` means it took effect; no other value does.

### 3.2 Command line

```bash
cd "$HOME/.dsh/profiles/desktop"
pnpm add dsh-workflow-map
```

```powershell
# One command into the desktop profile (the bundled DSH CLI forwards the rest to that profile's pnpm; use the full path if it is not on PATH)
dsh plugin --profile desktop add dsh-workflow-map
```

Then append `"dsh-workflow-map"` to the `dsh.profile.bundles` array in that directory's `package.json`.

### 3.3 Local source

```bash
cd "$HOME/.dsh/profiles/desktop"
pnpm add "dsh-workflow-map@link:/path/to/dsh-workflow-map"
```

`link:` creates a symlink, so source edits are reflected on disk immediately.

### 3.4 Verify the install

```bash
# 1) the package is on disk
ls "$HOME/.dsh/profiles/desktop/node_modules/dsh-workflow-map"

# 2) the host view endpoint works (expect HTTP 200 and a JSON body)
curl -i "http://127.0.0.1:<GUI port>/dsh-workflow/state?sessionId=<session id>"

# 3) the UI: a clickable sidebar icon, a panel in the main area, a same-named tab in the session tab bar
```

---

## 4. How changes take effect

The plugin has two halves with different load times:

| Half | Contains | Takes effect | Why |
|---|---|---|---|
| Browser half | `client.js` (built from `src/client/*.js`) | **Page refresh (F5)** | Front-end code loads per request |
| Host half | `lib/index.js`, `src/fold.mjs`, `src/route.js` | **Restart the DSH process** | ESM module cache cannot be replaced in-process |

Restart once after the first install; afterwards UI-only changes need no restart.

**Upgrading from `0.3.x` to `1.0.0`**: the checkpoint version `STATE_VERSION` goes from 5 to 6 (a step
now records the event interval it ran in). A checkpoint written before the bump cannot be used to recompute
node attribution, so under the existing contract it is dropped and the state is rebuilt from the session log.
The **first open of a historical session therefore folds it again**, and the map may briefly be empty before
it reappears; nothing needs to be done by hand and no session log is lost. See the `[1.0.0]` section of
[CHANGELOG](CHANGELOG.md).

---

## 5. Data boundary

### 5.1 What is read

- **Session event log**: `todo/write`, `tool/call`, `tool/result`, `step/start|end`, `turn/start|end`,
  `stepProgress/report`, `user/message`, `assistant/message`, `approval/*`, `agent/inbox/*` and others.
  Event types not listed return the same state reference with no copy.
- **PAE plan file**: `<project>/.pae/<sessionId>/orchestrator.json`. Read-only, cached by `mtime:size` and
  re-parsed only when the file changes; the parsed result is deep-frozen. A missing file, a partial write or
  malformed fields yield `null` and degrade to the todo table only, never throwing.

**Node attribution and `view.unassigned`.** An event lands on the step whose seq interval covers it (`windowStart` / `windowEnd`; when several steps cover the same seq, the one that started latest wins); when the PAE plan carries `anchorSeqs`, the anchor range decides. An event that no step covers is **not** folded back onto "the running step" or "the last step": it is counted in `view.unassigned.nodes`, with the first seq that failed to land kept in `sinceSeq`. That counter and `counts.nodes` (attributed nodes) are published separately; adding the two gives every activity the session recorded, and neither figure stands in for that total on its own.

### 5.2 What is not read

- **File bodies**. Fields such as `content`, `old_str` and `new_str` never enter the state, so how much
  the agent writes does not grow the panel's state.
- **The network**. The plugin makes no outbound requests; all data comes from local processes and files.

### 5.3 Truncation and limits

| Item | Limit | On overflow |
|---|---|---|
| Arguments / result text | 200 characters each | The UI states "host cap 200 characters" |
| Nodes per step | 300 | Keep head and tail, drop the middle into `truncated.stepNodes` |
| Nodes per session | 1200 | Evict starting from the step with the most nodes; no step is ever emptied |
| Injection history | 40 rows | Keep the newest |
| Approval records | 40 rows | Keep the newest |
| Titles | 120 characters | Truncated with an ellipsis |

Eviction deliberately does not start with the oldest: the oldest nodes usually belong to finished steps,
so time-based eviction would empty historical steps.

---

## 6. Interaction

| Action | Result |
|---|---|
| Click a unit | The right page shows that step's record (report, artifacts, stats) |
| Click a round interface | The right page lists that type's calls |
| Click a call row | Expand the full arguments, result and error in place |
| `Esc` | Close the right page, not the panel |
| Gear | Open settings: palette, motion, detail depth, node limit |
| `↻` | Read the current session's view again now; the button briefly shows "Refreshed" |
| Copy control | Copy path / command / snapshot, with a receipt that restores after 1.5 s |

The view is polled: every 0.8 s while the page is visible, every 3 s while it is hidden, as a conditional
request (`If-None-Match`) that the host answers with `304` and no body when nothing changed. `↻` runs one
cycle of that same request, for the case where automatic polling is blocked; it neither changes the cadence
nor adds a second data path.

Settings:

| Item | Values | Effect |
|---|---|---|
| Palette `palette` | `rainbow` / `brand` / `soft` | Switches accent colours and gradients |
| Motion `motion` | `full` / `always` / `static` | `full` follows session activity; `always` plays even when idle; `static` turns everything off |
| Detail depth `detail` | `summary` / `title` | `title` hides the rail's second line |
| Node limit `nodeLimit` | 30 / 60 / 120 / 0 | `0` means unlimited |

Preferences live in one `localStorage` record; a corrupted or outdated record degrades field by field to the
 defaults without blocking rendering.

---

## 7. Export

The gear offers four exports: copy / download times Markdown / JSON. The exported snapshot contains the
steps, their status, the percentage source, the node list and the report artifact paths - never file bodies.

---

## 8. Compatibility and constraints

- **DeepSeek Harness**: the `engines.dsh` range `>=0.2.1-rc.1 <0.3.0-0` (relies on session projections and `webServer` route registration); `0.3.0` and newer are not supported.
- **Node.js**: `>=20`.
- The three endpoints mount on the host's existing port; **no new listener** is opened.
- The composer is rendered by the host and is not part of this plugin. The plugin neither replaces nor
  overlays it; it only yields space on the session-tab page through a stylesheet rule.
- The fold path never reads a clock: every time value in the view comes from event timestamps, so the same
  event sequence always yields the same view (replayable).

---

## 9. Development

```bash
# after editing src/client/*.js, rebuild the browser half
node tools/build-client.mjs

# offline self-tests (10 suites; each suite prints its passed/total count and exit code)
node tools/selftest-fold.mjs          # fold semantics
node tools/selftest-host.mjs          # registration, schema, projection wiring
node tools/selftest-orchestrator.mjs  # plan file reading and merging
node tools/selftest-shape.mjs         # package shape, config, files whitelist
node tools/selftest-panel.mjs         # render tree, styles, interaction
node tools/selftest-detail.mjs        # node and step details
node tools/selftest-effects.mjs       # animation and motion fallback
node tools/selftest-settings.mjs      # settings and export
node tools/probe-route.mjs            # HTTP routes (real loopback)
node tools/probe-steer.mjs            # injection / revoke channel

# read-only regression over real logs
node tools/check-real-injects.mjs     # fold historical logs in bulk, per-session result
node tools/audit-real.mjs             # four-constraint audit
```

Browser measurements (needs a Chromium; the scripts auto-detect Chrome / Edge; light/dark theme contrast included):

```bash
pwsh -File tools/measure-panel.ps1
pwsh -File tools/measure-timing.ps1
pwsh -File tools/measure-inject.ps1
pwsh -File tools/measure-dock.ps1
pwsh -File tools/measure-flow.ps1
pwsh -File tools/measure-effects.ps1
pwsh -File tools/measure-branches.ps1
pwsh -File tools/measure-detail.ps1
pwsh -File tools/measure-settings.ps1
pwsh -File tools/measure-main.ps1
```
`client.js` is a build artifact (its first line carries a GENERATED marker) and must not be edited by hand.
Browser parity check (Edge and Chrome, one run each): `node tools/check-browser.mjs`; it exits 0 only when both engines
produce the same assertion set with the same per-item verdicts.
`tools/retired/` holds historical scripts for removed UI; they are not part of the verification chain.

---

## 10. Key constants

Every threshold is defined once and read by the self-tests, so this table and the code share one source:

| Constant | Value | Location | Meaning |
|---|---|---|---|
| `NODES_PER_STEP` | 300 | `src/fold.mjs` | Nodes per step |
| `NODES_TOTAL` | 1200 | `src/fold.mjs` | Nodes per session |
| `TEXT_LIMIT` | 200 | `src/fold.mjs` | Argument and result text |
| `TITLE_LIMIT` | 120 | `src/fold.mjs` | Titles |
| `INJECT_LIMIT` | 40 | `src/fold.mjs` | Injection history retained |
| `APPROVAL_LIMIT` | 40 | `src/fold.mjs` | Approval records retained |
| `WF_SIDE_SLOTS` | 2 | `src/client/theme.js` | Interfaces per side |
| `WF_STEP_RAIL` | 6 | `src/client/theme.js` | Progress rail height (px) |
| `WF_FLOW_CAP` | 60 | `src/client/theme.js` | Default call-list window |
| Request body | 2000 chars / 64 KiB | `src/route.js` | Injection request limit |

---

## 11. Plan file and todo table precedence

The map's steps come from two sources, in a fixed order:

| Priority | Source | Effect |
|---|---|---|
| 1 | Todo table `todo/write` | This turn's step titles and statuses, the session's newest statement |
| 2 | Plan file `.pae/<sessionId>/orchestrator.json` | While `phase` is `planning` / `scheduled` / `executing` / `paused`, its step titles, `statuses` and `anchorSeqs` apply |
| - | The same file at `completed` / `aborted` | The plan is over: its steps and reports are still published for the detail page, but it no longer changes any row's title or status |

The plan file is written once and never deleted. Read without that distinction, a previous turn's plan
overrides the rows the current todo table has just created, and the panel disagrees with the conversation.
The view's plan section therefore carries a boolean `terminal`, and both halves (host and browser) obey it.

---

## 12. Known issues

Both defects recorded in 0.3.0 are closed:

| Original # | Symptom | Status |
|---|---|---|
| 1 | With the brand palette the running unit's frame used the default gradient | Fixed (`8bf6f2c`); the same residue under the `soft` palette was fixed in 0.3.1 |
| 2 | The type page subtitle showed an unsubstituted `{count}` placeholder | Fixed (`8bf6f2c`) |

There are no known functional defects at present. Changes to the host half need a DSH process restart;
that is how activation works, not a defect.

---

## 13. Layout

```
dsh-workflow-map/
├─ index.js                  package entry (re-exports lib/index.js)
├─ lib/index.js              host half: session projection + three HTTP endpoints
├─ src/
│  ├─ fold.mjs               events -> state -> view (pure, no clock, no IO)
│  ├─ orchestrator.mjs       read-only PAE plan file
│  ├─ route.js               /state · /steer · /unsteer
│  └─ client/                browser-half sources (inlined into one file at build)
├─ client.js                 build artifact
├─ cordis.patch.yml          mount declaration
├─ locale/{zh,en}.json       dictionaries
├─ docs/                     release guide
└─ tools/                    self-tests · probes · browser measurements
```

---

## 14. FAQ

**Can it show several sessions at once?**
The panel shows the current session only. Switching sessions switches the content; nothing is merged or tiled.

**Does it slow DSH down?**
The fold is pure with no IO; the view is derived from state, and state has hard limits (300 nodes per step,
1200 per session). Polling compares `rev` first and returns 304 without rebuilding when nothing changed.
File bodies never enter the state.

**Why does the percentage sometimes stay still for a long time?**
A self-report moves only when the model reports that step again; the time baseline creeps up with the elapsed time, is
capped at 90 %, and stops moving once it reaches the cap. If the step is waiting for the next turn (the turn has ended
while the todo table still says `in_progress`), the rail publishes no number and the panel shows "waiting for the next
turn" instead. The second line ("estimated N minutes ago") states how stale the displayed value is.

**Why does an unfinished step never reach 100 %?**
A self-report caps at 99 and the time baseline at 90; only a done/failed status pins 100 %. This keeps "nearly there"
from being confused with "already there". A step that is still waiting for the next turn shows no number rather than 100 %.

**Does it upload user code?**
No. The plugin makes no network requests; it reads only the local session log and the `.pae` plan file.

**Can I install only the UI and skip the host half?**
No. Both halves belong to one package: `dsh.profile.bundles` registers the host row, and the browser half is
loaded by that row.

**Can I turn animation off?**
Set motion to `static` in the settings, or enable "reduce motion" in the OS; both set every animation inside
the panel to `none`.

---

## 15. License

MIT. Commercial use, modification and redistribution are permitted; keep the copyright notice.

---

## 16. Reporting an issue

The following helps locate a problem:

1. DSH version and plugin version (`version` in `package.json`);
2. The response body of `GET /dsh-workflow/state?sessionId=<id>` - **it contains task titles and file
   paths, so redact before posting**;
3. A screenshot of the panel where it goes wrong;
4. For fold-related issues, include the relevant event sequence from that session log.
