// Variable references in preset text use `self.label`, the CONNECTION's label,
// not the module id. Companion resolves $(label:variable) against whatever the
// operator named this connection — hardcoding the module id produces buttons
// that render the raw $(...) text on any connection that has been renamed, and
// on a second instance of the same module.
import { safeId } from "./main.js";

// Per-device presets are generated from the fleet, because a fleet's device ids
// are its configuration. The fleet-wide section is fixed and exists before the
// module has connected — "record everything" is meaningful without knowing what
// "everything" is yet.
//
// The button worth defending here is "Every connected switcher is recording".
// A red "something is recording" light is the wrong question before a take: it
// is true when three of four machines are rolling, which is exactly the failure
// an ISO shoot cannot recover from.

const WHITE = 0xffffff;
const BLACK = 0x000000;
const GREY = 0x333333;
const RED = 0xcc0000;
const AMBER = 0xcc7a00;
const BLUE = 0x0066cc;
const DARKGREEN = 0x003300;
const BRIGHTGREEN = 0x00ff00;

function preset({
  name,
  text,
  size = "14",
  color = WHITE,
  bgcolor = GREY,
  actions = [],
  feedbacks = [],
}) {
  return {
    type: "simple",
    name,
    style: { text, size, color, bgcolor, show_topbar: false },
    steps: [{ down: actions, up: [] }],
    feedbacks,
  };
}

export default function UpdatePresets(self) {
  const presets = {};
  const structure = [];

  // --- Fleet-wide ----------------------------------------------------------
  presets.fleet_record_start = preset({
    name: "Record: start the whole fleet",
    text: "REC ALL\nSTART",
    bgcolor: BLACK,
    actions: [{ actionId: "recordFleet", options: { mode: "start" } }],
    feedbacks: [
      {
        feedbackId: "allRecording",
        options: {},
        style: { bgcolor: RED, color: WHITE },
      },
    ],
  });

  presets.fleet_record_stop = preset({
    name: "Record: stop the whole fleet",
    text: "REC ALL\nSTOP",
    bgcolor: BLACK,
    actions: [{ actionId: "recordFleet", options: { mode: "stop" } }],
    feedbacks: [
      {
        feedbackId: "anyRecording",
        options: {},
        style: { bgcolor: AMBER, color: BLACK },
      },
    ],
  });

  presets.fleet_all_recording = preset({
    name: "ALL rolling (no action) — the pre-take check",
    text: `ALL REC\n$(${self.label}:recording_count)/$(${self.label}:online_count)`,
    bgcolor: RED,
    feedbacks: [
      {
        feedbackId: "allRecording",
        options: {},
        style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
      },
    ],
  });

  presets.fleet_stream_start = preset({
    name: "Stream: start the whole fleet",
    text: "STREAM ALL\nSTART",
    bgcolor: BLACK,
    actions: [{ actionId: "streamFleet", options: { mode: "start" } }],
    feedbacks: [
      {
        feedbackId: "anyStreaming",
        options: {},
        style: { bgcolor: RED, color: WHITE },
      },
    ],
  });

  presets.fleet_stream_stop = preset({
    name: "Stream: stop the whole fleet",
    text: "STREAM ALL\nSTOP",
    bgcolor: BLACK,
    actions: [{ actionId: "streamFleet", options: { mode: "stop" } }],
  });

  presets.fleet_online = preset({
    name: "Whole fleet connected (no action)",
    text: `FLEET\n$(${self.label}:online_count)/$(${self.label}:device_count)`,
    bgcolor: RED,
    feedbacks: [
      {
        feedbackId: "fleetOnline",
        options: {},
        style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
      },
    ],
  });

  presets.overseer_connected = preset({
    name: "Overseer is connected",
    text: `OVERSEER\n$(${self.label}:connection_status)`,
    bgcolor: RED,
    actions: [{ actionId: "refresh", options: {} }],
    feedbacks: [
      {
        feedbackId: "overseerConnected",
        options: {},
        style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
      },
    ],
  });

  structure.push({
    id: "fleet",
    name: "Fleet",
    description:
      "'ALL rolling' is the one to put in front of an operator before a take. 'Any switcher is recording' is true when three of four are rolling, which is the failure an ISO shoot cannot recover from.",
    definitions: [
      {
        id: "fleet-main",
        type: "simple",
        name: "Fleet",
        presets: [
          "fleet_all_recording",
          "fleet_record_start",
          "fleet_record_stop",
          "fleet_stream_start",
          "fleet_stream_stop",
          "fleet_online",
          "overseer_connected",
        ],
      },
    ],
    keywords: ["record", "stream", "fleet", "iso"],
  });

  // --- Per switcher, generated --------------------------------------------
  for (const d of self.devices) {
    const id = d.id;
    const key = safeId(id);
    const label = d.name ?? id;
    const refs = [];

    const add = (suffix, def) => {
      presets[`${key}_${suffix}`] = def;
      refs.push(`${key}_${suffix}`);
    };

    add(
      "record",
      preset({
        name: `${label}: record toggle`,
        text: `${label}\nREC\n$(${self.label}:${key}_record_duration)`,
        size: "14",
        bgcolor: BLACK,
        actions: [{ actionId: "record", options: { id, mode: "toggle" } }],
        feedbacks: [
          {
            feedbackId: "recording",
            options: { id },
            style: { bgcolor: RED, color: WHITE },
          },
          // Amber while flushing: the file is not closed, and this is the state
          // during which pulling the disk loses the take.
          {
            feedbackId: "recordStopping",
            options: { id },
            style: { bgcolor: AMBER, color: BLACK },
          },
        ],
      }),
    );

    add(
      "stream",
      preset({
        name: `${label}: stream toggle`,
        text: `${label}\nSTREAM\n$(${self.label}:${key}_stream_bitrate)`,
        bgcolor: BLACK,
        actions: [{ actionId: "stream", options: { id, mode: "toggle" } }],
        feedbacks: [
          {
            feedbackId: "streamLive",
            options: { id },
            style: { bgcolor: RED, color: WHITE },
          },
          {
            feedbackId: "streamConnecting",
            options: { id },
            style: { bgcolor: AMBER, color: BLACK },
          },
        ],
      }),
    );

    add(
      "iso",
      preset({
        name: `${label}: record in ISO`,
        text: `${label}\nISO`,
        bgcolor: BLACK,
        actions: [{ actionId: "recordMode", options: { id, mode: "iso" } }],
        feedbacks: [
          {
            feedbackId: "recordMode",
            options: { id, mode: "iso" },
            style: { bgcolor: BLUE, color: WHITE },
          },
        ],
      }),
    );

    add(
      "pgm",
      preset({
        name: `${label}: record PGM only`,
        text: `${label}\nPGM`,
        bgcolor: BLACK,
        actions: [{ actionId: "recordMode", options: { id, mode: "pgm" } }],
        feedbacks: [
          {
            feedbackId: "recordMode",
            options: { id, mode: "pgm" },
            style: { bgcolor: BLUE, color: WHITE },
          },
        ],
      }),
    );

    add(
      "disk",
      preset({
        name: `${label}: recording headroom (no action)`,
        text: `${label}\n$(${self.label}:${key}_record_minutes_left) min`,
        bgcolor: BLACK,
        feedbacks: [
          {
            feedbackId: "diskLow",
            options: { id },
            style: { bgcolor: RED, color: WHITE },
          },
        ],
      }),
    );

    add(
      "online",
      preset({
        name: `${label}: connected (no action)`,
        text: `${label}\n$(${self.label}:${key}_connection)`,
        bgcolor: RED,
        feedbacks: [
          {
            feedbackId: "connected",
            options: { id },
            style: { bgcolor: DARKGREEN, color: BRIGHTGREEN },
          },
        ],
      }),
    );

    add(
      "mute",
      preset({
        name: `${label}: monitor mute`,
        text: `${label}\nMON`,
        bgcolor: BLACK,
        actions: [{ actionId: "monitorMute", options: { id, mode: "toggle" } }],
        feedbacks: [
          {
            feedbackId: "monitorMuted",
            options: { id },
            style: { bgcolor: BLUE, color: WHITE },
          },
        ],
      }),
    );

    add(
      "cache",
      preset({
        name: `${label}: stream cache (no action)`,
        text: `${label}\nCACHE\n$(${self.label}:${key}_stream_cache_pct)%`,
        bgcolor: BLACK,
        feedbacks: [
          {
            feedbackId: "streamCacheHigh",
            options: { id, percent: 50 },
            style: { bgcolor: AMBER, color: BLACK },
          },
        ],
      }),
    );

    structure.push({
      id: `device-${key}`,
      name: label,
      description: `${d.model ?? "ATEM"} at ${d.address ?? "unknown address"}`,
      definitions: [
        {
          id: `device-${key}-main`,
          type: "simple",
          name: label,
          presets: refs,
        },
      ],
      keywords: ["atem", label],
    });
  }

  self.setPresetDefinitions(structure, presets);
}
