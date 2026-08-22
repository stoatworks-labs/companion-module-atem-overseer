# Companion — Atem Overseer user guide

This module runs **record and stream across a fleet of Blackmagic ATEM switchers** from one
surface, through [Atem Overseer](https://github.com/stoatworks-labs/atem-overseer).

The [README](../README.md) covers installing the module. This is how to build a surface with it,
and where the numbers on it will mislead you.

> **Before you rely on this:** the module's own tests drive its real source against a fake
> Overseer over real HTTP and a real WebSocket, covering the conventions that matter — the
> "anything but start means stop" behaviour, toggles refusing to guess, fleet actions skipping
> disconnected switchers, and the four-state transports.
>
> That is a test against a **fake** server, not against a rack of switchers. Rehearse the page
> before you use it on a shoot.
>
> This module was built with AI assistance, directed and reviewed by a human author.

---

## Connecting

Overseer's server, port **4700** by default.

> **There is no authentication and Overseer binds every interface.** Start and stop recording and
> streaming on switchers that may be live on air are reachable by anyone who can route to that
> port. No token, no session, no TLS. **Private production network only.**

---

## The one button to build first

**"ALL rolling".**

A red "something is recording" light is the wrong question before a take: it is true when three of
four machines are rolling, which is precisely the failure an ISO shoot cannot recover from.

The **ALL rolling** preset shows `recording/online` and only goes green when the two counts match.
Put it where the person calling the take can see it, and do not substitute the any-recording
feedback for it.

---

## Four transport states, and the middle two are the useful ones

| Feedback | Means |
| --- | --- |
| **Recording** | Rolling. |
| **Still flushing a recording** | `stopping` — **the file is not closed yet.** Pulling power or unplugging the disk here loses the take. |
| **Streaming** | The encoder is running. |
| **Stream is connecting** | Encoder up, nothing reaching the platform yet. A button showing this as "streaming" tells you that you are live before you are. |
| **Stream is being ingested** | The platform is actually taking it. |

The generated per-switcher record preset goes **red for recording and amber while flushing**. That
amber is the one that saves a take — it is the window in which someone reaches for the drive.

---

## Toggles refuse rather than guess

Overseer compares the action to the literal string `start` — **anything else means stop**, with no
validation and no error. `{"action":"begin"}` stops the recording and cheerfully returns `ok`.

So a toggle in this module resolves to exactly `start` or `stop` from the switcher's own
last-reported status, and **if that status is unknown it sends nothing at all** and logs why.

That is deliberate: a toggle that guessed would, half the time, stop a take. If a toggle appears
to do nothing, look in the log — the status was unknown.

**Fleet actions apply only to connected switchers.** Commanding a disconnected one produces an
error toast per device, which is noise rather than information.

---

## Two numbers that are easy to read wrongly

**Recording headroom is seconds of recording time, not disk space.** The ATEM protocol does not
expose disk capacity at all — this is the switcher's own estimate at the current bitrate. The
variable is in minutes, and the warning threshold lives in the connection config. Change the
bitrate and the same disk reports different headroom, correctly.

**Stream cache is a fraction of the buffer in use, 0–100%.** It is a *network health* indicator,
not progress. **A rising cache means the uplink cannot keep up** — that is the number to put next
to a stream button on a venue with questionable internet.

---

## Launch runs on the server's machine

**Launch a desktop app** starts it on the computer hosting Overseer, not the one running
Companion. If those are different machines, the app opens somewhere you may not be looking.

---

## Building a surface that fails safe

1. **ALL rolling**, prominent, near whoever calls the take.
2. **Per-switcher record buttons from the generated section** — they carry the red/amber states
   already.
3. **Stream cache next to any stream button** on an uncertain uplink.
4. **Headroom with a threshold set** in the connection config, so it warns in minutes rather than
   in a number nobody converts under pressure.
5. **Overseer connected** somewhere visible: when it goes, every other light on the page is the
   last thing that was true rather than what is true now.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| **A toggle does nothing** | The switcher's status is unknown, so it refused to guess. The log says so. |
| **A fleet action skipped a machine** | It was disconnected. Fleet actions only reach connected switchers. |
| **"Something is recording" is green but a machine is not rolling** | That is what the any-recording feedback means. Use **ALL rolling**. |
| **Headroom looks wrong for the disk** | It is time at the current bitrate, not capacity. |
| **Stream says connecting and never ingests** | The encoder is up and the platform is not taking it — a key, a URL or an uplink problem, upstream of this module. |
| **Launch opened the app on the wrong machine** | It runs where Overseer runs. |

---

## See also

- [README](../README.md) — installing, and the full action/feedback/variable list
- [`companion/HELP.md`](../companion/HELP.md) — the same material, in Companion's help panel
