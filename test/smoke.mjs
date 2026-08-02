// Drives the Atem Overseer module's real source against a fake Overseer: a real
// HTTP server for the REST commands and a real WebSocket pushing snapshot/
// device/levels/toast. The cases that matter are the four-state transports, the
// "anything but 'start' means stop" convention, and the fleet actions skipping
// disconnected switchers.
import http from "node:http";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";

const watchdog = setTimeout(() => {
  console.error("\nTIMED OUT — no completion within 30s.");
  process.exit(2);
}, 30000);
watchdog.unref?.();

const MOD = new URL("../src/", import.meta.url).pathname;
const UpdateActions = (await import(`${MOD}actions.js`)).default;
const UpdateFeedbacks = (await import(`${MOD}feedbacks.js`)).default;
const UpdateVariables = (await import(`${MOD}variables.js`)).default;
const UpdatePresets = (await import(`${MOD}presets.js`)).default;
const { socket } = await import(`${MOD}api.js`);
const { safeId } = await import(`${MOD}main.js`);

function device(id, over = {}) {
  return {
    id,
    name: id.toUpperCase(),
    address: "10.0.0.1",
    model: "ATEM Mini Extreme ISO",
    connection: "connected",
    record: {
      status: "idle",
      mode: "iso",
      duration: null,
      filename: "",
      timeAvailable: 7200,
    },
    stream: {
      status: "idle",
      duration: null,
      bitrate: 0,
      cacheUsed: 0,
      serviceName: "YouTube",
      flvUrl: null,
      live: false,
    },
    disks: [],
    hostname: null,
    protocolVersion: "2.30",
    audio: { leftLevel: -20, rightLevel: -21, leftPeak: -8, rightPeak: -8 },
    monitorMuted: false,
    mediaPlayers: [],
    lastUpdate: Date.now(),
    ...over,
  };
}

const fleet = [
  device("stage-a"),
  device("stage-b"),
  device("spare", { connection: "disconnected" }),
];
const commands = [];

const body = (req) =>
  new Promise((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  const payload =
    req.method === "POST" ? JSON.parse((await body(req)) || "{}") : {};
  const parts = url.pathname.split("/").filter(Boolean); // api devices <id> <verb>
  const id = parts[2] ? decodeURIComponent(parts[2]) : null;
  const verb = parts[3];
  const dev = fleet.find((d) => d.id === id);

  if (url.pathname === "/api/snapshot") return send(200, { devices: fleet });
  if (url.pathname === "/api/external-apps")
    return send(200, {
      apps: [{ key: "asc", label: "ATEM Software Control" }],
    });

  if (parts[0] === "api" && parts[1] === "devices" && verb) {
    // Overseer turns EVERY thrown error into a 400, including unknown device.
    if (!dev) return send(400, { error: `unknown device: ${id}` });
    commands.push({ id, verb, payload });
    switch (verb) {
      case "record":
        // The real behaviour: compared to the literal 'start'; anything else
        // means stop.
        dev.record.status = payload.action === "start" ? "recording" : "idle";
        dev.record.duration =
          dev.record.status === "recording" ? "00:00:01.00" : null;
        break;
      case "stream":
        dev.stream.status = payload.action === "start" ? "streaming" : "idle";
        dev.stream.live = dev.stream.status === "streaming";
        break;
      case "record-mode":
        dev.record.mode = payload.mode;
        break;
      case "monitor-mute":
        dev.monitorMuted = !!payload.muted;
        break;
      case "streaming-service":
        return send(400, {
          error: "device does not support remote streaming config",
        });
      default:
        break;
    }
    pushDevice(dev);
    return send(200, { ok: true });
  }

  if (url.pathname === "/api/devices" && req.method === "POST") {
    fleet.push(device(payload.id, { name: payload.name }));
    pushSnapshot();
    return send(200, { ok: true });
  }
  if (parts[0] === "api" && parts[1] === "devices" && req.method === "DELETE") {
    const at = fleet.findIndex((d) => d.id === id);
    if (at >= 0) fleet.splice(at, 1);
    pushSnapshot();
    return send(200, { ok: true });
  }
  send(404, { error: "not found" });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Set();
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "snapshot", devices: fleet }));
  ws.on("close", () => clients.delete(ws));
});
const pushSnapshot = () => {
  for (const ws of clients)
    ws.send(JSON.stringify({ type: "snapshot", devices: fleet }));
};
const pushDevice = (d) => {
  for (const ws of clients)
    ws.send(JSON.stringify({ type: "device", device: d }));
};
const pushLevels = () => {
  for (const ws of clients)
    ws.send(
      JSON.stringify({
        type: "levels",
        levels: [
          {
            id: "stage-a",
            audio: {
              leftLevel: -6,
              rightLevel: -7,
              leftPeak: -3,
              rightPeak: -3,
            },
          },
        ],
      }),
    );
};

// --- the fake instance -----------------------------------------------------
let actions = {};
let feedbacks = {};
let variables = {};
let presetStructure = null;
let presetDefs = null;
const variableValues = {};
let lastError = "";
let lastWarn = "";
let rebuildCount = 0;

const self = {
  config: { host: "127.0.0.1", port: String(PORT), disklow: 30 },
  devices: [],
  connected: false,
  log: (level, msg) => {
    if (level === "error") lastError = msg;
    if (level === "warn") lastWarn = msg;
  },
  updateStatus: () => {},
  checkFeedbacks: () => {},
  setActionDefinitions: (d) => (actions = d),
  setFeedbackDefinitions: (d) => (feedbacks = d),
  setVariableDefinitions: (d) => (variables = d),
  setPresetDefinitions: (s, p) => {
    presetStructure = s;
    presetDefs = p;
  },
  setVariableValues: (v) => Object.assign(variableValues, v),
  parseVariablesInString: async (s) => s,
  device(id) {
    return this.devices.find((d) => d.id === String(id ?? "")) ?? null;
  },
  onlineDevices() {
    return this.devices.filter((d) => d.connection === "connected");
  },
  rebuild() {
    rebuildCount++;
    UpdateActions(this);
    UpdateFeedbacks(this);
    UpdateVariables(this);
    UpdatePresets(this);
    this.refreshVariableValues();
  },
  refreshVariableValues() {
    const values = {
      connection_status: this.connected ? "Connected" : "Disconnected",
      device_count: this.devices.length,
      online_count: this.onlineDevices().length,
      recording_count: this.devices.filter(
        (d) => d.record?.status === "recording",
      ).length,
      streaming_count: this.devices.filter(
        (d) => d.stream?.status === "streaming",
      ).length,
    };
    for (const d of this.devices) {
      const p = `${safeId(d.id)}_`;
      values[`${p}record_status`] = d.record?.status ?? "idle";
      values[`${p}record_duration`] = d.record?.duration ?? "--:--:--";
      values[`${p}record_minutes_left`] = Math.floor(
        (Number(d.record?.timeAvailable) || 0) / 60,
      );
      values[`${p}stream_status`] = d.stream?.status ?? "idle";
      values[`${p}stream_cache_pct`] = Math.round(
        (Number(d.stream?.cacheUsed) || 0) * 100,
      );
      values[`${p}audio_left`] = Number(d.audio?.leftLevel ?? -100).toFixed(1);
      values[`${p}connection`] = d.connection ?? "unknown";
    }
    this.setVariableValues(values);
  },
  applySnapshot(devices) {
    this.devices = devices ?? [];
    this.connected = true;
    this.rebuild();
  },
  applyDevice(d) {
    if (!d?.id) return;
    const at = this.devices.findIndex((x) => x.id === d.id);
    if (at >= 0) this.devices[at] = d;
    else {
      this.devices.push(d);
      this.rebuild();
      return;
    }
    this.connected = true;
    this.refreshVariableValues();
  },
  applyLevels(levels) {
    let touched = false;
    for (const e of levels) {
      const d = this.devices.find((x) => x.id === e.id);
      if (d) {
        d.audio = e.audio;
        touched = true;
      }
    }
    if (touched) this.refreshVariableValues();
  },
};

socket.connect(self);
await new Promise((r) => setTimeout(r, 400));

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${label}\n       ${e.message}`);
  }
};
const wait = () => new Promise((r) => setTimeout(r, 150));
const fire = (id, options = {}) => actions[id].callback({ options });
const fb = (id, options = {}) => feedbacks[id].callback({ options }, {});

console.log("\n== connection ==");
await check("the snapshot arrived on connect, unasked", () =>
  assert.equal(self.devices.length, 3),
);
await check("15 actions registered", () =>
  assert.equal(Object.keys(actions).length, 15),
);
await check("15 feedbacks registered", () =>
  assert.equal(Object.keys(feedbacks).length, 15),
);

console.log("\n== presets ==");
await check("a section per device plus the fleet section", () => {
  const ids = presetStructure.map((s) => s.id);
  assert.ok(ids.includes("fleet"));
  assert.ok(ids.includes("device-stage_a"), ids.join(","));
});
await check("every preset is 2.x 'simple' and cross-references resolve", () => {
  for (const [id, p] of Object.entries(presetDefs)) {
    assert.equal(p.type, "simple", `${id} type`);
    for (const st of p.steps)
      for (const a of st.down)
        assert.ok(actions[a.actionId], `${id} -> action ${a.actionId}`);
    for (const f of p.feedbacks)
      assert.ok(feedbacks[f.feedbackId], `${id} -> feedback ${f.feedbackId}`);
  }
});
await check(
  "nothing is defined outside a section, or referenced missing",
  () => {
    const referenced = new Set(
      presetStructure.flatMap((s) => s.definitions.flatMap((g) => g.presets)),
    );
    for (const s of presetStructure)
      for (const g of s.definitions)
        for (const ref of g.presets)
          assert.ok(presetDefs[ref], `${s.id} -> ${ref}`);
    for (const id of Object.keys(presetDefs))
      assert.ok(referenced.has(id), `${id} defined but in no section`);
  },
);

console.log("\n== the 'anything but start means stop' convention ==");
await check("toggle from idle sends exactly 'start'", async () => {
  commands.length = 0;
  await fire("record", { id: "stage-a", mode: "toggle" });
  await wait();
  assert.equal(commands[0].payload.action, "start");
  assert.equal(self.device("stage-a").record.status, "recording");
});
await check("toggle from recording sends exactly 'stop'", async () => {
  commands.length = 0;
  await fire("record", { id: "stage-a", mode: "toggle" });
  await wait();
  assert.equal(commands[0].payload.action, "stop");
  assert.equal(self.device("stage-a").record.status, "idle");
});
await check("toggle with no known status sends NOTHING", async () => {
  commands.length = 0;
  lastWarn = "";
  await fire("record", { id: "ghost", mode: "toggle" });
  await wait();
  assert.equal(commands.length, 0, "no request was made");
  assert.match(lastWarn, /stop a take/);
});
await check(
  "'stopping' counts as active, so toggle stops rather than starts",
  async () => {
    self.device("stage-a").record.status = "stopping";
    commands.length = 0;
    await fire("record", { id: "stage-a", mode: "toggle" });
    await wait();
    assert.equal(commands[0].payload.action, "stop");
  },
);

console.log("\n== fleet actions ==");
await check("record all skips the disconnected switcher", async () => {
  commands.length = 0;
  await fire("recordFleet", { mode: "start" });
  await wait();
  const ids = commands.map((c) => c.id).sort();
  assert.deepEqual(ids, ["stage-a", "stage-b"], "spare is disconnected");
});
await check(
  "allRecording is true only when every online one is rolling",
  async () => {
    assert.equal(fb("allRecording"), true);
    await fire("record", { id: "stage-b", mode: "stop" });
    await wait();
    assert.equal(fb("anyRecording"), true, "stage-a still is");
    assert.equal(fb("allRecording"), false, "but not all of them");
  },
);
await check("allRecording is false with nothing connected", () => {
  const saved = self.devices;
  self.devices = [];
  assert.equal(fb("allRecording"), false);
  self.devices = saved;
});

console.log("\n== transport states ==");
await check("streaming vs connecting vs live are distinguished", async () => {
  const d = self.device("stage-a");
  d.stream.status = "connecting";
  d.stream.live = false;
  assert.equal(fb("streamConnecting", { id: "stage-a" }), true);
  assert.equal(fb("streaming", { id: "stage-a" }), false);
  assert.equal(fb("streamLive", { id: "stage-a" }), false);
  d.stream.status = "streaming";
  d.stream.live = true;
  assert.equal(fb("streamConnecting", { id: "stage-a" }), false);
  assert.equal(fb("streamLive", { id: "stage-a" }), true);
});
await check("recordStopping is its own state", () => {
  self.device("stage-b").record.status = "stopping";
  assert.equal(fb("recordStopping", { id: "stage-b" }), true);
  assert.equal(fb("recording", { id: "stage-b" }), false);
});
await check("diskLow uses the configured minutes threshold", () => {
  const d = self.device("stage-a");
  d.record.timeAvailable = 7200;
  assert.equal(fb("diskLow", { id: "stage-a" }), false);
  d.record.timeAvailable = 600; // 10 minutes < 30
  assert.equal(fb("diskLow", { id: "stage-a" }), true);
});
await check("streamCacheHigh reads cacheUsed as a 0..1 fraction", () => {
  self.device("stage-a").stream.cacheUsed = 0.8;
  assert.equal(fb("streamCacheHigh", { id: "stage-a", percent: 50 }), true);
  self.device("stage-a").stream.cacheUsed = 0.2;
  assert.equal(fb("streamCacheHigh", { id: "stage-a", percent: 50 }), false);
});
await check("connected / fleetOnline", () => {
  assert.equal(fb("connected", { id: "stage-a" }), true);
  assert.equal(fb("connected", { id: "spare" }), false);
  assert.equal(fb("fleetOnline"), false, "spare is disconnected");
});

console.log("\n== levels are not state ==");
await check(
  "a levels packet updates variables without re-registering",
  async () => {
    const before = rebuildCount;
    pushLevels();
    await wait();
    assert.equal(rebuildCount, before, "no rebuild");
    assert.equal(variableValues.stage_a_audio_left, "-6.0");
  },
);

console.log("\n== fleet membership ==");
await check("adding a device rebuilds via a snapshot", async () => {
  const before = rebuildCount;
  await fire("addDevice", {
    newid: "stage-c",
    name: "Stage C",
    address: "10.0.0.9",
  });
  await wait();
  assert.ok(rebuildCount > before, "rebuilt");
  assert.ok(presetDefs.stage_c_record, "the new device got presets");
});
await check("removing a device drops its presets", async () => {
  await fire("removeDevice", { id: "stage-c" });
  await wait();
  assert.ok(!presetDefs.stage_c_record);
});

console.log("\n== error surfacing ==");
await check(
  "an unknown device's 400 carries Overseer's own message",
  async () => {
    lastError = "";
    await fire("recordMode", { id: "ghost", mode: "iso" });
    await wait();
    assert.match(lastError, /unknown device/);
  },
);
await check("a model capability gap is reported as such", async () => {
  lastError = "";
  await fire("streamingService", { id: "stage-a" });
  await wait();
  assert.match(lastError, /does not support remote streaming config/);
});

console.log("\n== teardown ==");
await check("close() settles", async () => {
  socket.close();
  await wait();
  assert.equal(socket.ws, null);
});

wss.close();
server.close();
console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} CHECK(S) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
