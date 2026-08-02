import { safeId } from "./main.js";

// Rebuilt on a FLEET change only (main.js applySnapshot), never on a device
// update — Overseer sends a `device` message on every state change, and
// re-registering definitions at that rate would churn the variable list.
export default function UpdateVariableDefinitions(self) {
  const defs = {
    connection_status: { name: "Overseer connection status" },
    device_count: { name: "Switchers in the fleet" },
    online_count: { name: "Switchers connected" },
    recording_count: { name: "Switchers recording" },
    streaming_count: { name: "Switchers streaming" },
  };

  for (const d of self.devices) {
    const p = `${safeId(d.id)}_`;
    const n = d.name ?? d.id;
    defs[`${p}name`] = { name: `${n}: name` };
    defs[`${p}model`] = { name: `${n}: model` };
    defs[`${p}connection`] = { name: `${n}: connection` };
    defs[`${p}record_status`] = { name: `${n}: record status` };
    defs[`${p}record_mode`] = { name: `${n}: record mode (pgm/iso)` };
    // A HH:MM:SS.ff string, or "--:--:--" when idle — not a number.
    defs[`${p}record_duration`] = { name: `${n}: record duration` };
    defs[`${p}record_filename`] = { name: `${n}: record filename` };
    defs[`${p}record_minutes_left`] = {
      name: `${n}: recording headroom (minutes)`,
    };
    defs[`${p}stream_status`] = { name: `${n}: stream status` };
    defs[`${p}stream_duration`] = { name: `${n}: stream duration` };
    defs[`${p}stream_bitrate`] = { name: `${n}: stream bitrate` };
    defs[`${p}stream_cache_pct`] = {
      name: `${n}: stream cache used (%) — network health, not progress`,
    };
    defs[`${p}stream_service`] = { name: `${n}: streaming service` };
    defs[`${p}monitor_muted`] = { name: `${n}: monitor bus` };
    defs[`${p}audio_left`] = { name: `${n}: audio left (dBFS)` };
    defs[`${p}audio_right`] = { name: `${n}: audio right (dBFS)` };
  }

  self.setVariableDefinitions(defs);
}
