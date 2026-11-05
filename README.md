# Smart Irrigation — web dashboard

**Live dashboard:** https://jmhatake123.github.io/Website/

Remote monitoring and control for a real hydroponic fertigation rig — built for CIT-U EE Smart
Irrigation / Pinamungahan Automated Farm. Static site (`index.html`, `script.js`, `style.css`) on
GitHub Pages, backed by Firebase Realtime Database and Authentication. ESP1, the rig's master
controller, is the only writer of live telemetry; this page reads it and queues commands that the
firmware validates before acting on — the dashboard has no authority of its own over the hardware.

## About the system

Three controllers, split by role rather than duplicated logic:

- **Arduino Nano** — sensor hub only. Reads soil, NPK, and environment sensors, frames packets,
  sends them on. No decisions, no actuators.
- **ESP32 #1 (master)** — the single source of authority. Scheduling, fault classification, GSM
  alerts, logging, the on-device LCD UI, and everything this dashboard talks to.
- **ESP32 #2 (actuator executor)** — drives the pumps and valves, counts flow, and enforces its own
  local safety stops (dead-man release, overcurrent, mixing-tank hold) even if ESP1 goes silent.

Firmware source: https://github.com/JKyle-N/Smart-Irrigation

## What the dashboard does

- **Rig lock** — one switch, at the top of every tab and on System, that locks this website's controls
  and the buttons on the rig's LCD together. It is ESP1's own Lock Screen flag, so locking or unlocking at
  the rig does the same to the website. Automatic watering carries on; Emergency stop, switching pumps and
  valves off and cancelling a forced run still work. Operators and privileged accounts can lock and unlock.
- **Live Dashboard** — readings grouped by what they're about (water, air and light, main battery, solar
  and the second battery), the current run with its pumps, and the recent commands with ESP1's replies,
  read straight from ESP1's telemetry snapshot.
- **Zone Profiles** — one card per column: its soil readings (compared with a crop profile you pick),
  what ESP1 does with it in plain words (what it does, when it runs, its nutrient targets), an ON/OFF
  switch, and **Edit settings**, which sends ESP1 only what you changed and shows the change first.
- **Controls** — emergency stop, a Pumps and valves ON/OFF switch (ESP1's actuation lockout), a forced
  run ("Water a column now") with its countdown and Cancel, and restarting one of the three boards.
- **Manual/Test** *(privileged accounts)* — direct hardware control: a timed test, a hold-to-run test,
  the pump exercise (setting and run-now), and a flow meter check, all under ESP1/ESP2's own dead-man
  timers and safety limits.
- **Diagnostics** — a summary, in words, of anything ESP1 reports as wrong; then ESP1's diagnostic values
  item by item, sensor readings before conversion, an on-demand ESP2 sensor sweep, and recent events.
- **System** *(privileged accounts)* — remote versions of the LCD's Settings menu: the rig lock, clock,
  watering thresholds, battery-switch fault, restore factory settings.
- **User Management** *(operators only)* — accounts grouped by status, waiting-for-approval first;
  approve, reject, restrict, or block them; give 1-hour access or make a Sub-operator; see each
  account's online/offline state and recent activity in plain words.
- **Help** — how the rig decides when to water and add nutrients, step-by-step guides for each task,
  and a definition of every word the site uses, searchable. The small "i" icons across the site give
  the short version and link to the matching Help entry.

Access is tiered — pending / approved / restricted / rejected / blocked, plus two fixed operator
accounts and an optional temporary or Sub-operator elevation on top of "approved" — and enforced
server-side by `firebase-rules.json`, not just by what the page shows or hides. Only approved accounts
and operators can see readings: pending, restricted, rejected and blocked accounts can't, and an
account restricted while its page is open loses them immediately.

## Tech stack

Vanilla HTML/CSS/JS, no framework or build step · Firebase Realtime Database + Authentication ·
GitHub Pages, auto-deployed on push to `main` (see `.github/workflows/static.yml`) · a small Vercel
function (`delete-user-api`) for the one operation Firebase Auth can't do client-side — permanently
deleting a user account.

## Contributors

CIT-U EE Smart Irrigation / Pinamungahan Automated Farm

- Christian Jay A. Tibon
- Mark Bon Q. Compuesto
- Johnbert Kyle T. Nacor
- John Michael N. Sugian
- John Ray C. Lagamayo
- John Christopher S. Cabrillos

---

## Realtime Database layout

| Node | Written by | Purpose |
|---|---|---|
| `irrigation/live` | ESP1 only | Telemetry snapshot, faults, event log, `diagnostics.webManual` |
| `irrigation/commands/$id` | page (queued) → ESP1 (status) | One-shot commands; ESP1 validates every payload. The page may also change a row from `queued` to `withdrawn` (not `EMERGENCY_STOP`, `DISABLE_ACTUATIONS` or `CANCEL_FORCE`), because ESP1 runs a queued row however old it is. While `irrigation/live/diagnostics/system/lcdLocked` is true (the rig lock), a new row must be `EMERGENCY_STOP`, `DISABLE_ACTUATIONS`, `CANCEL_FORCE`, `ACK_FAULT` or `LCD_LOCK`. `LCD_LOCK` needs the privileged tier, and an optional `byName` must be the sender's own name (or `Operator` for the two operator accounts) |
| `irrigation/config/zones` | page only | Which crop and stage each zone is growing, and each column's saved setups (`savedSettings`). Dashboard-side notes — the numeric targets reach the rig through `SET_COLUMN`, not from here |
| `irrigation/manual` | page only | `{seq, want}` — the Manual/Test mutual-exclusion hold. ESP1 reads it and answers in `live` under `diagnostics.webManual`. Acquiring (`want:true`) requires the privileged tier (operator/temp-access/sub-operator, see `users/$uid` below) and an unlocked rig; releasing (`want:false`) is open to anyone signed in |
| `irrigation/testHold` | page only | `{seq, bit, want}` — Manual/Test's press-and-hold buttons. ESP1's `firebasePollTestHold()` reads it and drives ESP2's existing `TEST,HOLD`/`TEST,RELEASE` dead-man; `bit` is restricted (by the rule) to the same 10-target whitelist as `TEST_PULSE`'s `target` field (transfer/colA/colB/colC/mixer/nutA/nutB/nutC/phUp/phDn). Starting a hold (`want:true`) needs the privileged tier on an account that is still approved, and an unlocked rig, the same as `irrigation/manual`; releasing is open to anyone signed in. The page registers an `onDisconnect` release while a button is held, because ESP1 acts on a leftover `want:true` when it boots. ESP1 never answers a hold it won't run, so the page switches off any hold button ESP1 would ignore and says why |
| `presence/$uid` | every signed-in session, its own | `{online, lastChanged}` via `.info/connected`+`onDisconnect()`. Read-restricted to the two operator UIDs (plus self) — powers User Management's online/offline display |
| `activity/$uid` | every signed-in session, its own | `{what, at}` entries, one per command actually queued (see `activitySummary()`/`queueCommand()`). Read-restricted to **only** the two operator UIDs, not even the account's own owner — powers User Management's recent-activity list |
| `users/$uid` | see `status`/`tempAccessUntil`/`subOperator` | `tempAccessUntil` (ms timestamp) is a 1-hour, operator-granted Manual/Test+System elevation; `subOperator` (boolean) is the same elevation but persistent until an operator withholds it again. Both settable only by the two operator UIDs, both cleared automatically the moment status leaves `'approved'` (reject/block/restrict) |

## Security rules

`firebase-rules.json` is the authoritative copy of the database rules. Rules are enforced
server-side, so keeping them in the repo costs nothing in security and makes changes reviewable.

**After editing it, publish it**: dry-run with `firebase deploy --only database --dry-run`, then run
`firebase deploy --only database`, or paste the whole file into Firebase Console → Realtime Database →
Rules. The deployed copy is the live source; this file is only version control, and the two drift apart
silently if you change one without the other.

`irrigation/manual` needs its rule present or the Manual/Test tab does not work at all — RTDB denies
by default where no rule matches, so without it both the page's write and ESP1's read are rejected
and the hold is never granted. Proceed itself (2026-09-10 revision) no longer waits for that grant —
it reveals the panel for any privileged-tier account regardless of ESP1's connection state, so the
individual test buttons (gated on a fresh snapshot) are what actually stays unusable, not the screen.

Credentials and the device UID live in `Firebase infos.txt` at the repo root, which is gitignored.
