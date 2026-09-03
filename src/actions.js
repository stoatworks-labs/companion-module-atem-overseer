import { post, del, getJson } from "./api.js";

// One rule shapes every transport action here:
//
//   Overseer compares `action` to the literal string 'start'. **Anything else
//   means stop** — a typo, a missing field, `true`. There is no validation and
//   no error: {"action":"begin"} stops the recording and returns {"ok":true}.
//
// So a toggle must never send a computed-and-hoped-for value: it resolves to
// exactly 'start' or 'stop' from the device's own last-reported status. And an
// action whose device is unknown must not fall through to a request at all,
// because that request would stop something.

export function deviceChoices(self) {
  return self.devices.map((d) => ({
    id: d.id,
    label: `${d.name ?? d.id}${d.model ? ` (${d.model})` : ""}`,
  }));
}

export default function UpdateActions(self) {
  const devices = deviceChoices(self);
  const deviceOption = {
    id: "id",
    type: "dropdown",
    label: "Switcher",
    choices: devices,
    default: devices[0]?.id ?? "",
    allowCustom: true,
  };

  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      self.log("error", e.message);
    }
  };

  // Options declared `useVariables: true` arrive already expanded: Companion
  // resolves them before invoking the callback. `parseVariablesInString` does
  // not exist in base 2.x — on the context or on InstanceBase — and calling it
  // throws when the action fires, while the module still loads cleanly.
  const resolveId = (event) => String(event.options.id ?? "").trim();

  /** 'start' | 'stop' from a mode option, resolving 'toggle' against the
   *  device's own last-reported status. Returns null when it cannot be
   *  determined — the caller must then send nothing. */
  const resolveAction = (mode, status, activeStates) => {
    if (mode === "start") return "start";
    if (mode === "stop") return "stop";
    if (status === undefined || status === null) return null;
    return activeStates.includes(status) ? "stop" : "start";
  };

  self.setActionDefinitions({
    record: {
      name: "Record: start / stop",
      description:
        "Toggle resolves against the switcher's own reported status, so it stays right if recording was started from Overseer or the switcher itself. With no status the toggle does nothing rather than guessing — and guessing wrong here stops a take.",
      options: [
        deviceOption,
        {
          id: "mode",
          type: "dropdown",
          label: "Action",
          choices: [
            { id: "start", label: "Start" },
            { id: "stop", label: "Stop" },
            { id: "toggle", label: "Toggle" },
          ],
          default: "toggle",
        },
      ],
      callback: async (event) =>
        run(async () => {
          const id = resolveId(event);
          if (!id) return;
          const status = self.device(id)?.record?.status;
          const action = resolveAction(event.options.mode, status, [
            "recording",
            "stopping",
          ]);
          if (!action) {
            self.log(
              "warn",
              `Record toggle skipped for "${id}" — no status known, and a wrong guess would stop a take.`,
            );
            return;
          }
          await post(self, `/api/devices/${encodeURIComponent(id)}/record`, {
            action,
          });
        }),
    },

    recordFleet: {
      name: "Record: start / stop the whole fleet",
      description:
        "Applies to every CONNECTED switcher. Disconnected ones are skipped — commanding them produces an error toast per device, which is noise rather than information.",
      options: [
        {
          id: "mode",
          type: "dropdown",
          label: "Action",
          choices: [
            { id: "start", label: "Start all" },
            { id: "stop", label: "Stop all" },
          ],
          default: "start",
        },
      ],
      callback: async (event) => {
        for (const d of self.onlineDevices()) {
          try {
            await post(
              self,
              `/api/devices/${encodeURIComponent(d.id)}/record`,
              {
                action: event.options.mode,
              },
            );
          } catch (e) {
            self.log("warn", `${d.name ?? d.id}: ${e.message}`);
          }
        }
      },
    },

    recordMode: {
      name: "Record: PGM / ISO mode",
      options: [
        deviceOption,
        {
          id: "mode",
          type: "dropdown",
          label: "Mode",
          choices: [
            { id: "pgm", label: "Program only" },
            { id: "iso", label: "ISO (all inputs)" },
          ],
          default: "iso",
        },
      ],
      callback: async (event) =>
        run(async () => {
          const id = resolveId(event);
          if (!id) return;
          await post(
            self,
            `/api/devices/${encodeURIComponent(id)}/record-mode`,
            { mode: event.options.mode },
          );
        }),
    },

    stream: {
      name: "Stream: start / stop",
      options: [
        deviceOption,
        {
          id: "mode",
          type: "dropdown",
          label: "Action",
          choices: [
            { id: "start", label: "Start" },
            { id: "stop", label: "Stop" },
            { id: "toggle", label: "Toggle" },
          ],
          default: "toggle",
        },
      ],
      callback: async (event) =>
        run(async () => {
          const id = resolveId(event);
          if (!id) return;
          const status = self.device(id)?.stream?.status;
          const action = resolveAction(event.options.mode, status, [
            "streaming",
            "connecting",
            "stopping",
          ]);
          if (!action) {
            self.log(
              "warn",
              `Stream toggle skipped for "${id}" — no status known.`,
            );
            return;
          }
          await post(self, `/api/devices/${encodeURIComponent(id)}/stream`, {
            action,
          });
        }),
    },

    streamFleet: {
      name: "Stream: start / stop the whole fleet",
      options: [
        {
          id: "mode",
          type: "dropdown",
          label: "Action",
          choices: [
            { id: "start", label: "Start all" },
            { id: "stop", label: "Stop all" },
          ],
          default: "start",
        },
      ],
      callback: async (event) => {
        for (const d of self.onlineDevices()) {
          try {
            await post(
              self,
              `/api/devices/${encodeURIComponent(d.id)}/stream`,
              {
                action: event.options.mode,
              },
            );
          } catch (e) {
            self.log("warn", `${d.name ?? d.id}: ${e.message}`);
          }
        }
      },
    },

    monitorMute: {
      name: "Monitor bus: mute / unmute",
      description:
        "The ATEM's own monitor bus, not the browser's playback. Metering is telemetry and keeps showing regardless.",
      options: [
        deviceOption,
        {
          id: "mode",
          type: "dropdown",
          label: "Set",
          choices: [
            { id: "mute", label: "Mute" },
            { id: "unmute", label: "Unmute" },
            { id: "toggle", label: "Toggle" },
          ],
          default: "toggle",
        },
      ],
      callback: async (event) =>
        run(async () => {
          const id = resolveId(event);
          if (!id) return;
          const muted =
            event.options.mode === "toggle"
              ? !self.device(id)?.monitorMuted
              : event.options.mode === "mute";
          await post(
            self,
            `/api/devices/${encodeURIComponent(id)}/monitor-mute`,
            { muted },
          );
        }),
    },

    mediaAssign: {
      name: "Media: assign a pool slot to a media player",
      options: [
        deviceOption,
        {
          id: "playerIndex",
          type: "number",
          label: "Media player (0-based)",
          min: 0,
          max: 7,
          default: 0,
        },
        {
          id: "sourceType",
          type: "dropdown",
          label: "Source type",
          choices: [
            { id: "still", label: "Still" },
            { id: "clip", label: "Clip" },
          ],
          default: "still",
        },
        {
          id: "slotIndex",
          type: "number",
          label: "Slot (0-based)",
          min: 0,
          max: 63,
          default: 0,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const id = resolveId(event);
          if (!id) return;
          await post(
            self,
            `/api/devices/${encodeURIComponent(id)}/media/assign`,
            {
              playerIndex: Number(event.options.playerIndex),
              sourceType: event.options.sourceType,
              slotIndex: Number(event.options.slotIndex),
            },
          );
        }),
    },

    streamingService: {
      name: "Stream: push the RTMP config to the switcher",
      description:
        "Model-dependent. A switcher whose runner has no setStreamingService answers 'device does not support remote streaming config' — that is a capability gap, not a fault. Use the Streaming.xml route for those.",
      options: [deviceOption],
      callback: async (event) =>
        run(async () => {
          const id = resolveId(event);
          if (!id) return;
          await post(
            self,
            `/api/devices/${encodeURIComponent(id)}/streaming-service`,
            {},
          );
        }),
    },

    launchApp: {
      name: "Launch a desktop app for a switcher",
      description:
        "Runs on the machine hosting the Overseer SERVER, not the one running this Companion. If they are different computers, the app opens where the server is.",
      options: [
        deviceOption,
        {
          id: "app",
          type: "textinput",
          label: "App key",
          default: "",
          useVariables: true,
          tooltip:
            "One of the keys from Overseer's /api/external-apps. Use 'Log the external app list' to see them.",
        },
      ],
      callback: async (event) =>
        run(async () => {
          const id = resolveId(event);
          const app = String(event.options.app ?? "").trim();
          if (!id || !app) return;
          await post(self, `/api/devices/${encodeURIComponent(id)}/launch`, {
            app,
          });
        }),
    },

    listApps: {
      name: "Log the external app list",
      options: [],
      callback: async () =>
        run(async () => {
          const body = await getJson(self, "/api/external-apps");
          self.log("info", `External apps: ${JSON.stringify(body.apps ?? [])}`);
        }),
    },

    // --- Fleet management --------------------------------------------------
    addDevice: {
      name: "Fleet: add a switcher",
      description: "Adds and connects immediately.",
      options: [
        {
          id: "newid",
          type: "textinput",
          label: "Id",
          default: "",
          useVariables: true,
        },
        {
          id: "name",
          type: "textinput",
          label: "Name",
          default: "",
          useVariables: true,
        },
        {
          id: "address",
          type: "textinput",
          label: "Address",
          default: "",
          useVariables: true,
        },
      ],
      callback: async (event) =>
        run(async () => {
          const t = (k) => String(event.options[k] ?? "").trim();
          const id = t("newid");
          const address = t("address");
          if (!id || !address) return;
          await post(self, "/api/devices", {
            id,
            name: t("name") || id,
            address,
          });
        }),
    },

    removeDevice: {
      name: "Fleet: remove a switcher",
      description: "Disconnects and removes it from Overseer's fleet.",
      options: [deviceOption],
      callback: async (event) =>
        run(async () => {
          const id = resolveId(event);
          if (!id) return;
          await del(self, `/api/devices/${encodeURIComponent(id)}`);
        }),
    },

    // --- Restreamer --------------------------------------------------------
    restreamerProvision: {
      name: "Restreamer: provision this switcher's channel",
      options: [deviceOption],
      callback: async (event) =>
        run(async () => {
          const id = resolveId(event);
          if (!id) return;
          await post(
            self,
            `/api/devices/${encodeURIComponent(id)}/restreamer/provision`,
            {},
          );
        }),
    },

    restreamerDestroy: {
      name: "Restreamer: tear this switcher's channel down",
      options: [deviceOption],
      callback: async (event) =>
        run(async () => {
          const id = resolveId(event);
          if (!id) return;
          await del(self, `/api/devices/${encodeURIComponent(id)}/restreamer`);
        }),
    },

    refresh: {
      name: "Log the current fleet snapshot",
      options: [],
      callback: async () =>
        run(async () => {
          const body = await getJson(self, "/api/snapshot");
          self.log("info", JSON.stringify(body, null, 2));
        }),
    },
  });
}
