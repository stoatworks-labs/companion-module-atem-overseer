import { deviceChoices } from "./actions.js";
import { socket } from "./api.js";

// Recording and streaming each have four states, not two, and collapsing them
// loses the one that matters. 'stopping' is not 'idle' — the switcher is still
// flushing to disk, and pulling power there is how a take gets lost.
// 'connecting' is not 'streaming' — the encoder is up but nothing is going out
// yet. Both get their own feedback so a button can show them.

export default function UpdateFeedbacks(self) {
  const devices = deviceChoices(self);
  const deviceOption = {
    id: "id",
    type: "dropdown",
    label: "Switcher",
    choices: devices,
    default: devices[0]?.id ?? "",
    allowCustom: true,
  };

  const dev = (f) => self.device(f.options.id);

  self.setFeedbackDefinitions({
    recording: {
      type: "boolean",
      name: "Switcher is recording",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [deviceOption],
      callback: (f) => dev(f)?.record?.status === "recording",
    },
    recordStopping: {
      type: "boolean",
      name: "Switcher is still flushing a recording",
      description:
        "'stopping' — the file is not closed yet. Do not pull power or unplug the disk while this is lit.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [deviceOption],
      callback: (f) => dev(f)?.record?.status === "stopping",
    },
    recordMode: {
      type: "boolean",
      name: "Record mode is PGM or ISO",
      defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
      options: [
        deviceOption,
        {
          id: "mode",
          type: "dropdown",
          label: "Mode",
          choices: [
            { id: "pgm", label: "Program only" },
            { id: "iso", label: "ISO" },
          ],
          default: "iso",
        },
      ],
      callback: (f) => dev(f)?.record?.mode === f.options.mode,
    },
    streaming: {
      type: "boolean",
      name: "Switcher is streaming",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [deviceOption],
      callback: (f) => dev(f)?.stream?.status === "streaming",
    },
    streamConnecting: {
      type: "boolean",
      name: "Stream is connecting",
      description:
        "The encoder is up but nothing is reaching the platform yet. A button that showed this as 'streaming' would say you were live before you were.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [deviceOption],
      callback: (f) => dev(f)?.stream?.status === "connecting",
    },
    streamLive: {
      type: "boolean",
      name: "Stream is being ingested",
      description:
        "The switcher's own `live` flag — the platform is actually taking the feed, which is a stronger claim than 'streaming'.",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [deviceOption],
      callback: (f) => !!dev(f)?.stream?.live,
    },
    streamCacheHigh: {
      type: "boolean",
      name: "Stream cache above a threshold",
      description:
        "cacheUsed is 0..1, the fraction of the stream buffer in use — a NETWORK-health indicator, not a percentage complete. A rising cache means the upstream link cannot keep up.",
      defaultStyle: { bgcolor: 0xcc7a00, color: 0x000000 },
      options: [
        deviceOption,
        {
          id: "percent",
          type: "number",
          label: "Above (%)",
          min: 1,
          max: 100,
          default: 50,
        },
      ],
      callback: (f) =>
        (Number(dev(f)?.stream?.cacheUsed) || 0) * 100 >
        Number(f.options.percent ?? 50),
    },
    connected: {
      type: "boolean",
      name: "Switcher is connected",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [deviceOption],
      callback: (f) => dev(f)?.connection === "connected",
    },
    diskLow: {
      type: "boolean",
      name: "Recording headroom is low",
      description:
        "timeAvailable is SECONDS OF RECORDING TIME at the current bitrate, not disk bytes — the ATEM protocol does not expose capacity. The threshold comes from the connection config.",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [deviceOption],
      callback: (f) => {
        const seconds = Number(dev(f)?.record?.timeAvailable);
        if (!Number.isFinite(seconds)) return false;
        return seconds < (Number(self.config?.disklow) || 30) * 60;
      },
    },
    monitorMuted: {
      type: "boolean",
      name: "Monitor bus is muted",
      defaultStyle: { bgcolor: 0x0066cc, color: 0xffffff },
      options: [deviceOption],
      callback: (f) => !!dev(f)?.monitorMuted,
    },
    anyRecording: {
      type: "boolean",
      name: "Any switcher in the fleet is recording",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [],
      callback: () =>
        self.devices.some((d) => d.record?.status === "recording"),
    },
    allRecording: {
      type: "boolean",
      name: "Every connected switcher is recording",
      description:
        "The check worth having before a take: not 'something is recording' but 'nothing was missed'. False when nothing is connected.",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [],
      callback: () => {
        const online = self.onlineDevices();
        return (
          online.length > 0 &&
          online.every((d) => d.record?.status === "recording")
        );
      },
    },
    anyStreaming: {
      type: "boolean",
      name: "Any switcher in the fleet is streaming",
      defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
      options: [],
      callback: () =>
        self.devices.some((d) => d.stream?.status === "streaming"),
    },
    fleetOnline: {
      type: "boolean",
      name: "Every switcher in the fleet is connected",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [],
      callback: () =>
        self.devices.length > 0 &&
        self.devices.every((d) => d.connection === "connected"),
    },
    overseerConnected: {
      type: "boolean",
      name: "Overseer is connected",
      description:
        "The state WebSocket is open. Every other feedback holds its last known value while this is dark.",
      defaultStyle: { bgcolor: 0x003300, color: 0x00ff00 },
      options: [],
      callback: () => !!socket.ws && socket.ws.readyState === 1,
    },
  });
}
