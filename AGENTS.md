# AGENTS.md — bringing an LLM up to speed on this Companion module

Orientation for an AI assistant (or a new human) picking this project up cold. There is no
`CLAUDE.md` here; this is the entry point.

---

## 1. What this is

A **Bitfocus Companion connection module** for **Atem Overseer**, the fleet dashboard for
Blackmagic ATEM switchers. It drives record and stream per switcher and fleet-wide, PGM/ISO
mode, monitor mute, media assignment and restreamer channels.

JavaScript, Node 22 runtime, `@companion-module/base` 2.x.

## 2. Commands go over REST, state over the WebSocket

Overseer offers the same four transport commands on both, calling the same `runCommand()` —
they cannot drift. This module still splits them, because **a successful WebSocket command
produces no reply at all** and a failed one replies with a `toast` addressed to that client.
Over the socket, silence is success and a message is failure, which makes an error and a
dropped connection indistinguishable. REST at least answers with a status code.

The socket is still read for toasts: they also carry failures caused by the Overseer UI or
another surface, which is context an operator wants.

## 3. The convention that shapes every transport action

**Overseer compares `action` to the literal string `'start'`. Anything else means stop** —
a typo, a missing field, `true`. There is no validation and no error; `{"action":"begin"}`
stops the recording and returns `{"ok":true}`.

Consequences enforced in `src/actions.js`:

- A toggle resolves to exactly `'start'` or `'stop'` from the device's own last-reported
  status. It never sends a computed-and-hoped-for value.
- **With no known status, a toggle sends NOTHING** and logs why. Falling through to a request
  would stop a take. There is a test for this; do not "simplify" it away.
- An unknown device id must not reach a request at all, for the same reason.

## 4. Three WebSocket message types, and they are not interchangeable

| Type       | Sent when                                                          | What the module does                 |
| ---------- | ------------------------------------------------------------------ | ------------------------------------ |
| `snapshot` | a **fleet** change (device added/removed) — _not_ on state changes | full rebuild of every definition set |
| `device`   | one device changed — the frequent one                              | values + feedbacks only              |
| `levels`   | audio meters, batched, far more frequent than either               | values only, **no `checkFeedbacks`** |

`levels` deliberately does not trigger `checkFeedbacks`: no feedback reads a level, and
re-evaluating every feedback at metering rate burns CPU for nothing. If a level-based
feedback is ever added it needs its own throttled check rather than being folded in.

## 5. Fields that are easy to assume wrongly

- **`record.timeAvailable` is SECONDS OF RECORDING TIME, not bytes.** The ATEM protocol does
  not expose disk capacity at all. The `diskLow` feedback converts the configured minutes
  threshold; do not turn this into a percentage.
- **`stream.cacheUsed` is 0..1** — the fraction of the stream cache buffer in use, a
  _network_-health indicator, not a percentage complete.
- **`record.duration` / `stream.duration` are `HH:MM:SS.ff` strings or `null`**, not numbers.
- **`protocolVersion` is the ATEM protocol version, not firmware.** Firmware is not on the
  wire.
- **`monitorMuted` is the ATEM monitor bus**, not the browser's playback.
- `stream.live` is a stronger claim than `stream.status === 'streaming'`: the platform is
  actually ingesting. Both have feedbacks and the generated preset uses `live`.

## 6. Traps already paid for

- **Overseer's async wrapper turns EVERY thrown error into a 400**, including "unknown
  device". There is no other error status, so the body's message is the only thing
  distinguishing a typo from a refusal — always prefer `body.error` over the status code.
- **`@companion-module/base` 2.x presets are `setPresetDefinitions(structure, definitions)`**
  with `type: 'simple'`. A 1.x `category` field loads and then never appears in the UI.
- **Companion variable ids allow only `[a-zA-Z0-9_]`.** Overseer device ids come from its
  config file and are free text; `safeId()` sanitises.

## 7. Deliberate omissions — do not "fix" these

- **No media still upload.** Overseer takes raw RGBA, not PNG/JPEG — the browser converts and
  scales before posting, and a client posting an encoded image produces garbage in the media
  pool rather than an error. Companion has nothing to convert with.
- **No `POST /api/config.xml` import.** It merges and saves but **does not apply device
  changes live** — a fleet imported that way is inert until restart, which is not what a
  button press should mean.
- **No restreamer destinations action.** `destinations` must be an array or it is treated as
  empty, so a malformed body silently clears every egress destination. Not a button.

## 8. Context that matters

These switchers may be live on air, and a wrong stop loses a take that cannot be re-shot.
Prefer refusing to act over acting on a guess — that is the whole reason toggles resolve
from reported state.

## 9. Conventions

- Not in the official Companion module store — installs via **Settings → Developer modules
  path**.
- Overseer itself is verified against its built-in `--mock` fleet plus a real ATEM Mini
  Extreme ISO in a lab; transport, streaming and media-upload are the paths a simulator is
  least likely to match.
- `npm test` drives the real source against a fake Overseer (real HTTP + real WebSocket).
- Ships a user-facing AI-assisted disclaimer.
- "Commit" means commit **and** push.
