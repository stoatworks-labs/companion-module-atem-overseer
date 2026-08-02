# Atem Overseer

Controls a fleet of Blackmagic ATEM switchers through
[Atem Overseer](https://github.com/stoatworks-labs/atem-overseer).

## Connection

Overseer's server, port **4700** by default.

**There is no authentication and Overseer binds every interface.** Start/stop
recording and streaming on live switchers are reachable by anyone who can route
to that port. Private production network only.

## Before a take: "ALL rolling"

Use the **ALL rolling** preset, not "any switcher is recording". Any-recording
is true when three of four machines are rolling — the failure an ISO shoot
cannot recover from. ALL rolling shows `recording/online` and only goes green
when they match.

## Toggles will refuse rather than guess

Overseer treats **anything that is not the literal `start` as stop**, with no
error. So toggles here resolve to exactly `start` or `stop` from the switcher's
own last-reported status, and **send nothing** if that status is unknown — a
warning goes to the log instead. Guessing wrong stops a take.

## Four transport states

| Feedback                       | Means                                                                      |
| ------------------------------ | -------------------------------------------------------------------------- |
| Recording                      | Rolling                                                                    |
| **Still flushing a recording** | `stopping` — the file is not closed. Do not pull power or unplug the disk. |
| Streaming                      | The encoder is running                                                     |
| **Stream is connecting**       | Encoder up, nothing reaching the platform yet                              |
| Stream is being ingested       | The platform is actually taking it                                         |

## Fleet actions skip disconnected switchers

Commanding a disconnected switcher produces an error toast per device. Fleet
record/stream therefore apply to connected ones only.

## Two numbers that mislead

- **Recording headroom is seconds of recording time, not disk space.** The ATEM
  protocol does not expose capacity. Set the warning threshold (minutes) in the
  connection config.
- **Stream cache is a fraction of the buffer in use, 0–100%** — network health,
  not progress. Rising means the uplink cannot keep up.

## Launch runs on the server's machine

**Launch a desktop app** starts it on the computer hosting Overseer, not the one
running Companion. If those differ, the app opens where the server is.
