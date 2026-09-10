# Smart Irrigation — web dashboard

Static dashboard (`index.html`, `script.js`, `style.css`) served from GitHub Pages, talking to
Firebase Realtime Database. ESP1 is the only writer of live telemetry; the page reads it and queues
commands the firmware validates before acting on.

## Realtime Database layout

| Node | Written by | Purpose |
|---|---|---|
| `irrigation/live` | ESP1 only | Telemetry snapshot, faults, event log, `diagnostics.webManual` |
| `irrigation/commands/$id` | page (queued) → ESP1 (status) | One-shot commands; ESP1 validates every payload |
| `irrigation/config/zones` | page only | Which crop and stage each zone is growing. Dashboard-side notes — the numeric targets reach the rig through `SET_COLUMN`, not from here |
| `irrigation/manual` | page only | `{seq, want}` — the Manual/Test mutual-exclusion hold. ESP1 reads it and answers in `live` under `diagnostics.webManual`. Acquiring (`want:true`) requires the privileged tier (operator/temp-access/sub-operator, see `users/$uid` below); releasing (`want:false`) is open to anyone signed in |
| `irrigation/testHold` | page only | `{seq, bit, want}` — Manual/Test's press-and-hold buttons. ESP1's `firebasePollTestHold()` reads it and drives ESP2's existing `TEST,HOLD`/`TEST,RELEASE` dead-man; `bit` is restricted (by the rule) to the same 10-target whitelist as `TEST_PULSE`'s `target` field (transfer/colA/colB/colC/mixer/nutA/nutB/nutC/phUp/phDn) |
| `presence/$uid` | every signed-in session, its own | `{online, lastChanged}` via `.info/connected`+`onDisconnect()`. Read-restricted to the two operator UIDs (plus self) — powers User Management's online/offline display |
| `activity/$uid` | every signed-in session, its own | `{what, at}` entries, one per command actually queued (see `activitySummary()`/`queueCommand()`). Read-restricted to **only** the two operator UIDs, not even the account's own owner — powers User Management's recent-activity list |
| `users/$uid` | see `status`/`tempAccessUntil`/`subOperator` | `tempAccessUntil` (ms timestamp) is a 1-hour, operator-granted Manual/Test+System elevation; `subOperator` (boolean) is the same elevation but persistent until an operator withholds it again. Both settable only by the two operator UIDs, both cleared automatically the moment status leaves `'approved'` (reject/block/restrict) |

## Security rules

`firebase-rules.json` is the authoritative copy of the database rules. Rules are enforced
server-side, so keeping them in the repo costs nothing in security and makes changes reviewable.

**After editing it, paste the whole file into Firebase Console → Realtime Database → Rules and
publish.** The console is the live source; this file is only version control, and the two drift
apart silently if you change one without the other.

`irrigation/manual` needs its rule present or the Manual/Test tab does not work at all — RTDB denies
by default where no rule matches, so without it both the page's write and ESP1's read are rejected
and the hold is never granted. Proceed itself (2026-09-10 revision) no longer waits for that grant —
it reveals the panel for any privileged-tier account regardless of ESP1's connection state, so the
individual test buttons (gated on a fresh snapshot) are what actually stays unusable, not the screen.

Credentials and the device UID live in `Firebase infos.txt` at the repo root, which is gitignored.
