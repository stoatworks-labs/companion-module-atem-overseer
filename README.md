# companion-module-atem-overseer

> **AI-assisted project.** This module was built with the help of
> [Claude](https://claude.ai), Anthropic's AI assistant — including
> implementation and documentation. Review it accordingly before relying on
> it in production.

A [Bitfocus Companion](https://bitfocus.io/companion) connection module for
[Atem Overseer](https://github.com/stoatworks-labs/atem-overseer) — run record
and stream across a fleet of Blackmagic ATEM switchers from one surface.

<!-- downloads:start -->

## Download

**[v1.0.0](https://github.com/stoatworks-labs/companion-module-atem-overseer/releases/tag/v1.0.0)**

This release contains:

- [`atem-overseer-1.0.0.tgz`](https://github.com/stoatworks-labs/companion-module-atem-overseer/releases/download/v1.0.0/atem-overseer-1.0.0.tgz) — npm package, 24 KB
- [`companion-module-atem-overseer-pkg.tgz`](https://github.com/stoatworks-labs/companion-module-atem-overseer/releases/latest/download/companion-module-atem-overseer-pkg.tgz) — npm package, 24 KB

All builds, checksums and release notes: [github.com/stoatworks-labs/companion-module-atem-overseer/releases](https://github.com/stoatworks-labs/companion-module-atem-overseer/releases).

<!-- downloads:end -->

## What it does

- **Actions** — record and stream start/stop/toggle per switcher **and across
  the whole fleet**, PGM/ISO record mode, monitor-bus mute, media pool
  assignment, push the RTMP config, launch a desktop app, add/remove switchers,
  provision and tear down restreamer channels, and log the fleet snapshot.
- **Feedbacks** — recording, **still flushing a recording**, record mode,
  streaming, **stream connecting**, stream being ingested, stream cache high,
  switcher connected, recording headroom low, monitor muted, any/all recording,
  any streaming, whole fleet connected, Overseer connected.
- **Variables** — per switcher: name, model, connection, record status/mode/
  duration/filename/headroom, stream status/duration/bitrate/cache/service,
  monitor mute, audio levels. Plus fleet counts.
- **Presets** — a Fleet section, and **a section per switcher generated from
  the fleet**.

## The button that matters

**"ALL rolling"** — every _connected_ switcher is recording.

A red "something is recording" light is the wrong question before a take: it is
true when three of four machines are rolling, which is the failure an ISO shoot
cannot recover from. That preset shows `recording/online` and only goes green
when the counts match.

## Setting it up

Overseer's server, port 4700 by default.

> **There is no authentication and Overseer binds every interface.** Start and
> stop recording and streaming on switchers that may be live on air are
> reachable by anyone who can route to that port. No token, no session, no TLS.
> Run it on a private production network only.

## Four states, not two

Both transports have four states, and the middle ones are the useful ones:

| State        | Why it has its own feedback                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `stopping`   | The file is **not closed yet**. Pulling power or unplugging the disk here loses the take.                                      |
| `connecting` | The encoder is up but nothing is reaching the platform. A button showing this as "streaming" says you are live before you are. |

The generated per-switcher record preset goes red for recording and **amber
while flushing**.

## Toggles resolve from the switcher, not from a guess

Overseer compares `action` to the literal string `'start'` — **anything else
means stop**, with no validation and no error. `{"action":"begin"}` stops the
recording and returns `{"ok":true}`.

So a toggle here resolves to exactly `start` or `stop` from the switcher's own
last-reported status, and **if that status is unknown it sends nothing at all**
and logs why. Guessing wrong stops a take.

Fleet actions apply only to **connected** switchers — commanding a disconnected
one produces an error toast per device, which is noise rather than information.

## Two fields that are easy to read wrongly

- **Recording headroom is seconds of recording time, not disk bytes.** The ATEM
  protocol does not expose disk capacity at all; this is the switcher's own
  estimate at the current bitrate. The variable is in minutes and the threshold
  is in the connection config.
- **Stream cache is 0..1, a fraction of the buffer in use** — a _network_-health
  indicator, not a percentage complete. A rising cache means the upstream link
  cannot keep up.

## Tests

```bash
npm test
```

Drives the module's real source against a fake Overseer (real HTTP + real
WebSocket): the "anything but start means stop" convention, toggles refusing to
guess, fleet actions skipping disconnected switchers, the four-state transports,
and levels updating variables without re-registering definitions.

## Installing

Not in the official Companion module store. Install via
**Settings → Developer modules path**.

<!-- attributions:start -->
This project is built on other people's work — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
<!-- attributions:end -->

## Licence

MIT — see [LICENSE](LICENSE).
