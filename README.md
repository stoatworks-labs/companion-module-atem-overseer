# companion-module-atem-overseer

> **AI-assisted project.** This module was created with [Claude](https://claude.com/claude-code)
> (Anthropic), directed and reviewed by a human author. Check it over before you rely on it for
> a show.

A [Bitfocus Companion](https://bitfocus.io/companion) module for
[Atem Overseer](https://github.com/stoatworks-labs/atem-overseer). It runs record
and stream across a whole fleet of Blackmagic ATEM switchers from one surface.

<!-- downloads:start -->

## Download

**[v1.0.5](https://github.com/stoatworks-labs/companion-module-atem-overseer/releases/tag/v1.0.5)**

This release contains:

- [`atem-overseer-1.0.5.tgz`](https://github.com/stoatworks-labs/companion-module-atem-overseer/releases/download/v1.0.5/atem-overseer-1.0.5.tgz) — npm package, 25 KB
- [`companion-module-atem-overseer-pkg.tgz`](https://github.com/stoatworks-labs/companion-module-atem-overseer/releases/latest/download/companion-module-atem-overseer-pkg.tgz) — npm package, 25 KB

All builds, checksums and release notes: [github.com/stoatworks-labs/companion-module-atem-overseer/releases](https://github.com/stoatworks-labs/companion-module-atem-overseer/releases).

<!-- downloads:end -->

## What it does

- **Actions:** record and stream start/stop/toggle per switcher and across
  the whole fleet, PGM/ISO record mode, monitor-bus mute, media pool
  assignment, push the RTMP config, launch a desktop app, add/remove switchers,
  provision and tear down restreamer channels, and log the fleet snapshot.
- **Feedbacks:** recording, still flushing a recording, record mode,
  streaming, stream connecting, stream being ingested, stream cache high,
  switcher connected, recording headroom low, monitor muted, any/all recording,
  any streaming, whole fleet connected, and Overseer connected.
- **Variables:** per switcher, the name, model, connection, record status/mode/
  duration/filename/headroom, stream status/duration/bitrate/cache/service,
  monitor mute and audio levels. Plus fleet counts.
- **Presets:** a Fleet section, and a section per switcher built from the
  fleet.

## The button that matters

**"ALL rolling"**: every _connected_ switcher is recording.

Before a take, a red "something is recording" light answers the wrong question.
It's lit when three out of four machines are rolling, and that's the failure an
ISO shoot can't recover from. This preset shows `recording/online` and only goes
green when the counts match.

## Setting it up

Point it at Overseer's server, port 4700 by default.

> **There's no authentication and Overseer binds every interface.** Anyone who
> can route to that port can start and stop recording and streaming on switchers
> that may be live on air. There's no token, session or TLS. Run it on a private
> production network only.

## Four states, not two

Both transports have four states, and it's the two in the middle that earn
their keep:

| State        | Why it has its own feedback                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `stopping`   | The file is **not closed yet**. Pulling power or unplugging the disk here loses the take.                                      |
| `connecting` | The encoder is up but nothing is reaching the platform. A button showing this as "streaming" says you are live before you are. |

The generated per-switcher record preset goes red while recording and amber
while it's flushing.

## Toggles resolve from the switcher, not from a guess

Overseer compares `action` to the literal string `'start'`, and **anything else
means stop**, with no validation and no error. `{"action":"begin"}` stops the
recording and returns `{"ok":true}`, which is about as helpful as it sounds.

So a toggle here resolves to `start` or `stop` and nothing else, from the
switcher's own last-reported status. If that status is unknown it sends nothing
at all and logs why, because a wrong guess stops a take.

Fleet actions only apply to connected switchers. Sending a command to a
disconnected one gets you an error toast per device, which is noise rather than
anything useful.

## Two fields that are easy to read wrongly

- **Recording headroom is seconds of recording time, not disk bytes.** The ATEM
  protocol doesn't expose disk capacity at all; this is the switcher's own
  estimate at the current bitrate. The variable is in minutes and the threshold
  is in the connection config.
- **Stream cache is 0..1, a fraction of the buffer in use.** It's a
  _network_-health indicator, not a percentage complete. A rising cache means
  the upstream link can't keep up.

## Tests

```bash
npm test
```

This runs the module's actual code against a pretend Overseer (over real HTTP
and a real WebSocket). It covers the "anything but start means stop" convention,
toggles refusing to guess, fleet actions skipping disconnected switchers, the
four-state transports, and levels updating variables without re-registering
definitions.

## Installing

It's not in the official Companion module store. The quick way is to download
`companion-module-atem-overseer-pkg.tgz` from the
[releases page](https://github.com/stoatworks-labs/companion-module-atem-overseer/releases) and
import it with Companion's **Modules → Import module package**. Or install it as a developer
module through **Settings → Developer modules path**.

<!-- attributions:start -->
This project is built on other people's work — see [ATTRIBUTIONS.md](ATTRIBUTIONS.md).
<!-- attributions:end -->

## Licence

MIT, see [LICENSE](LICENSE).
