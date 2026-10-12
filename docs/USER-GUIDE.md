# Companion — Atem Overseer user guide

This module runs record and stream across a fleet of Blackmagic ATEM switchers from one surface,
through [Atem Overseer](https://github.com/stoatworks-labs/atem-overseer).

The [README](../README.md) covers installing the module. This guide is about building a surface
with it, and where the numbers on it will mislead you.

> **Before you rely on this:** the module's own tests run its actual code against a fake Overseer
> over real HTTP and a real WebSocket. They cover the conventions that matter: the "anything but
> start means stop" behaviour, toggles refusing to guess, fleet actions skipping disconnected
> switchers, and the four-state transports.
>
> That's a test against a **fake** server, not against a rack of switchers. Rehearse the page
> before you use it on a shoot.
>
> This module was built with AI assistance, directed and reviewed by a human author.

---

## Connecting

Overseer's server, port **4700** by default.

> **There's no authentication and Overseer binds every interface.** Anyone who can route to that
> port can start and stop recording and streaming on switchers that may be live on air. There's no
> token, session or TLS. **Private production network only.**

---

## The one button to build first

**"ALL rolling".**

Before a take, a red "something is recording" light answers the wrong question. It's lit when
three out of four machines are rolling, and that's the one failure an ISO shoot can't recover
from.

The **ALL rolling** preset shows `recording/online` and only goes green when the two counts match.
Put it where the person calling the take can see it, and don't swap the any-recording feedback in
for it.

---

## Four transport states, and the middle two are the useful ones

| Feedback | Means |
| --- | --- |
| **Recording** | Rolling. |
| **Still flushing a recording** | `stopping` — **the file is not closed yet.** Pulling power or unplugging the disk here loses the take. |
| **Streaming** | The encoder is running. |
| **Stream is connecting** | Encoder up, nothing reaching the platform yet. A button showing this as "streaming" tells you that you are live before you are. |
| **Stream is being ingested** | The platform is actually taking it. |

The generated per-switcher record preset goes **red for recording and amber while flushing**. The
amber is the one that saves a take, because that's the moment someone reaches for the drive.

---

## Toggles refuse rather than guess

Overseer compares the action to the literal string `start`, and **anything else means stop**, with
no validation and no error. `{"action":"begin"}` stops the recording and cheerfully returns `ok`.

So a toggle in this module resolves to `start` or `stop` and nothing else, from the switcher's own
last-reported status, and **if that status is unknown it sends nothing at all** and logs why.

That's on purpose: a toggle that guessed would stop a take half the time. If a toggle seems to do
nothing, look in the log; the status was unknown.

**Fleet actions only apply to connected switchers.** Sending a command to a disconnected one gets
you an error toast per device, which is noise rather than anything useful.

---

## Two numbers that are easy to read wrongly

**Recording headroom is seconds of recording time, not disk space.** The ATEM protocol doesn't
expose disk capacity at all; this is the switcher's own estimate at the current bitrate. The
variable is in minutes, and the warning threshold lives in the connection config. Change the
bitrate and the same disk reports different headroom, which is correct.

**Stream cache is a fraction of the buffer in use, 0–100%.** It tells you about *network health*,
not progress. **A rising cache means the uplink can't keep up**, so it's the number to put next to
a stream button at a venue where the internet's a bit questionable.

---

## Launch runs on the server's machine

**Launch a desktop app** starts the app on the computer running Overseer, not the one running
Companion. If those are different machines, it opens somewhere you might not be looking.

---

## Building a surface that fails safe

1. **ALL rolling**, big and obvious, near whoever calls the take.
2. **Per-switcher record buttons from the generated section.** They already carry the red and
   amber states.
3. **Stream cache next to any stream button** when the uplink's uncertain.
4. **Headroom with a threshold set** in the connection config, so it warns you in minutes rather
   than in a number nobody's going to convert under pressure.
5. **Overseer connected** somewhere you can see it. When it goes, every other light on the page is
   showing the last thing that was true rather than what's true now.

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

- [README](../README.md): installing, and the full list of actions, feedbacks and variables
- [`companion/HELP.md`](../companion/HELP.md): the same material, in Companion's help panel
