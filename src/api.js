import WebSocket from "ws";
import { InstanceStatus } from "@companion-module/base";

// Overseer offers the same four transport commands over both the WebSocket and
// REST — they call the same runCommand(), so they cannot drift. This module
// uses REST for commands and the WebSocket purely for state, for one reason:
//
//   **A successful WebSocket command produces no reply at all.** A FAILED one
//   replies with a `toast` addressed to that client. So over the socket, silence
//   is success and a message is failure — usable, but it means an error and a
//   dropped connection look identical. REST at least answers with a status code.
//
// Neither path is acknowledged in the sense that matters (confirmation comes
// from the next `device` snapshot either way), but a 400 with a body beats
// silence when a button does nothing.
//
// The WebSocket carries three message types worth distinguishing:
//   snapshot  full re-sync, re-broadcast on a FLEET change (device added or
//             removed) — NOT on state changes
//   device    one device changed; this is the frequent one
//   levels    batched audio meters, far more frequent than either. Never treat
//             a levels packet as a state update.

const RECONNECT_MS = 3000;

function base(self) {
  return `http://${self.config.host}:${self.config.port}`;
}

/**
 * POST a command.
 *
 * Overseer's async wrapper turns EVERY thrown error into a 400 — including
 * "unknown device", which would more naturally be a 404. There is no other
 * error status, so the body's message is the only thing that distinguishes
 * a typo'd id from a switcher that refused.
 */
export async function post(self, path, body = {}) {
  const res = await fetch(`${base(self)}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parsed.error || `POST ${path} failed: HTTP ${res.status}`);
  }
  if (parsed.ok === false) {
    throw new Error(parsed.error || `${path} reported failure`);
  }
  return parsed;
}

export async function getJson(self, path) {
  const res = await fetch(`${base(self)}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  return res.json();
}

export async function del(self, path) {
  const res = await fetch(`${base(self)}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed: HTTP ${res.status}`);
  return res.json().catch(() => ({}));
}

export const socket = {
  ws: null,
  reconnectTimer: null,
  closing: false,

  connect(self) {
    this.closing = false;
    let ws;
    try {
      ws = new WebSocket(`ws://${self.config.host}:${self.config.port}/ws`);
    } catch (e) {
      self.updateStatus(InstanceStatus.ConnectionFailure, e.message);
      this.scheduleReconnect(self);
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      self.log("info", `Connected to Atem Overseer at ${self.config.host}`);
      self.updateStatus(InstanceStatus.Ok);
      // No query needed: the server sends a full snapshot immediately on
      // connect, by design, so a client can render without asking.
    });

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        // Overseer drops malformed JSON silently in the other direction; do the
        // same here rather than filling an operator's log mid-show.
        return;
      }
      switch (msg.type) {
        case "snapshot":
          self.applySnapshot(msg.devices ?? []);
          break;
        case "device":
          self.applyDevice(msg.device);
          break;
        case "levels":
          self.applyLevels(msg.levels ?? []);
          break;
        case "toast":
          // The only acknowledgement the socket ever gives, and only for
          // failures. Worth logging even though this module commands over REST:
          // it also carries failures caused by the Overseer UI or another
          // surface, which is context an operator wants.
          self.log(
            msg.level === "error" ? "error" : "info",
            `Overseer: ${msg.text}`,
          );
          break;
        default:
          break;
      }
    });

    ws.on("close", () => {
      if (this.closing) return;
      self.updateStatus(InstanceStatus.Disconnected, "Overseer disconnected");
      this.scheduleReconnect(self);
    });

    ws.on("error", (err) => {
      self.updateStatus(InstanceStatus.ConnectionFailure, err.message);
    });
  },

  scheduleReconnect(self) {
    if (this.closing || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(self);
    }, RECONNECT_MS);
  },

  close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch {
        // Closing a socket that never opened throws; nothing to recover.
      }
      this.ws = null;
    }
  },
};
