import { InstanceBase, Regex, InstanceStatus } from "@companion-module/base";
import { UpgradeScripts } from "./upgrades.js";
import UpdateActions from "./actions.js";
import UpdateFeedbacks from "./feedbacks.js";
import UpdateVariableDefinitions from "./variables.js";
import UpdatePresets from "./presets.js";
import { socket } from "./api.js";

/** Companion variable ids allow only [a-zA-Z0-9_]. Overseer device ids come
 *  from its config file and are free text. */
export function safeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_]/g, "_");
}

export default class ModuleInstance extends InstanceBase {
  constructor(internal) {
    super(internal);
    this.devices = [];
    this.connected = false;
  }

  async init(config) {
    this.config = config;
    this.updateStatus(InstanceStatus.Connecting);
    this.rebuild();
    socket.connect(this);
  }

  async destroy() {
    socket.close();
  }

  async configUpdated(config) {
    this.config = config;
    socket.close();
    this.devices = [];
    this.connected = false;
    this.updateStatus(InstanceStatus.Connecting);
    socket.connect(this);
  }

  getConfigFields() {
    return [
      {
        type: "static-text",
        id: "info",
        width: 12,
        label: "Connection",
        value:
          "Atem Overseer's server, port 4700 by default. <b>There is no authentication and it binds every interface</b> — start/stop recording and streaming on live switchers are reachable by anyone who can route to that port. Run it on a private production network only.",
      },
      {
        type: "textinput",
        id: "host",
        label: "Overseer host",
        width: 8,
        default: "127.0.0.1",
        regex: Regex.HOSTNAME,
      },
      {
        type: "textinput",
        id: "port",
        label: "Port",
        width: 4,
        default: "4700",
        regex: Regex.PORT,
      },
      {
        type: "number",
        id: "disklow",
        label: "Warn when recording headroom drops below (minutes)",
        width: 6,
        min: 1,
        max: 600,
        default: 30,
      },
      {
        type: "static-text",
        id: "diskinfo",
        width: 12,
        label: "",
        value:
          "Headroom is <code>timeAvailable</code>, which is <b>seconds of recording time, not disk bytes</b> — the ATEM protocol does not expose capacity at all. Treat it as the switcher's own estimate at the current bitrate.",
      },
    ];
  }

  /** A full re-sync. Overseer re-broadcasts this on a FLEET change (a device
   *  added or removed), not on state changes — so this is exactly the moment
   *  the definition sets need rebuilding. */
  applySnapshot(devices) {
    this.devices = Array.isArray(devices) ? devices : [];
    this.connected = true;
    this.updateStatus(InstanceStatus.Ok);
    this.rebuild();
  }

  /** One device changed. The frequent message — values and feedbacks only, no
   *  re-registration, or a fleet under load would rebuild the dropdowns
   *  continuously. */
  applyDevice(device) {
    if (!device?.id) return;
    const at = this.devices.findIndex((d) => d.id === device.id);
    if (at >= 0) this.devices[at] = device;
    else {
      // A device arriving without a preceding snapshot shouldn't happen, but
      // adding it is cheaper than dropping state on the floor — and it needs
      // the full rebuild a snapshot would have done.
      this.devices.push(device);
      this.rebuild();
      return;
    }
    this.connected = true;
    this.refreshVariableValues();
    this.checkAllFeedbacks();
  }

  /**
   * Audio meters, batched and far more frequent than state.
   *
   * These are merged into the device objects so the level variables work, but
   * deliberately do NOT trigger checkFeedbacks: no feedback here reads a level,
   * and re-evaluating every feedback at metering rate would burn CPU for
   * nothing. If a level-based feedback is ever added, it needs its own
   * throttled check rather than being folded in here.
   */
  applyLevels(levels) {
    let touched = false;
    for (const entry of levels) {
      const device = this.devices.find((d) => d.id === entry.id);
      if (device) {
        device.audio = entry.audio;
        touched = true;
      }
    }
    if (touched) this.refreshVariableValues();
  }

  rebuild() {
    UpdateActions(this);
    UpdateFeedbacks(this);
    UpdateVariableDefinitions(this);
    UpdatePresets(this);
    this.refreshVariableValues();
    this.checkAllFeedbacks();
  }

  device(id) {
    return this.devices.find((d) => d.id === String(id ?? "")) ?? null;
  }

  /** Devices that are actually connected — the set a fleet action should touch.
   *  Commanding a disconnected switcher gets an error toast per device, which
   *  is noise rather than information. */
  onlineDevices() {
    return this.devices.filter((d) => d.connection === "connected");
  }

  refreshVariableValues() {
    const online = this.onlineDevices();
    const recording = this.devices.filter(
      (d) => d.record?.status === "recording",
    );
    const streaming = this.devices.filter(
      (d) => d.stream?.status === "streaming",
    );
    const values = {
      connection_status: this.connected ? "Connected" : "Disconnected",
      device_count: this.devices.length,
      online_count: online.length,
      recording_count: recording.length,
      streaming_count: streaming.length,
    };

    for (const d of this.devices) {
      const p = `${safeId(d.id)}_`;
      values[`${p}name`] = d.name ?? d.id;
      values[`${p}model`] = d.model ?? "";
      values[`${p}connection`] = d.connection ?? "unknown";
      values[`${p}record_status`] = d.record?.status ?? "idle";
      values[`${p}record_mode`] = d.record?.mode ?? "";
      // duration is a HH:MM:SS.ff STRING or null — not a number of seconds.
      values[`${p}record_duration`] = d.record?.duration ?? "--:--:--";
      values[`${p}record_filename`] = d.record?.filename ?? "";
      values[`${p}record_minutes_left`] = Math.floor(
        (Number(d.record?.timeAvailable) || 0) / 60,
      );
      values[`${p}stream_status`] = d.stream?.status ?? "idle";
      values[`${p}stream_duration`] = d.stream?.duration ?? "--:--:--";
      values[`${p}stream_bitrate`] = d.stream?.bitrate ?? 0;
      // cacheUsed is 0..1 — a fraction of the stream cache buffer in use, a
      // network-health indicator, NOT a percentage complete.
      values[`${p}stream_cache_pct`] = Math.round(
        (Number(d.stream?.cacheUsed) || 0) * 100,
      );
      values[`${p}stream_service`] = d.stream?.serviceName ?? "";
      values[`${p}monitor_muted`] = d.monitorMuted ? "Muted" : "Live";
      values[`${p}audio_left`] = Number(d.audio?.leftLevel ?? -100).toFixed(1);
      values[`${p}audio_right`] = Number(d.audio?.rightLevel ?? -100).toFixed(
        1,
      );
    }
    this.setVariableValues(values);
  }
}

export { UpgradeScripts };
