/**
 * Unit tests for Socket.io handlers: blob rooms (refresh) and voice (signal, join_room, etc.).
 * Run: cd server && node --test src/__tests__/socket.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { registerSocketHandlers } from "../socket.js";

describe("registerSocketHandlers (voice + blob)", () => {
  it("registers connection and expected event handlers on socket", () => {
    let connectionCb;
    const io = {
      on: (event, cb) => {
        assert.strictEqual(event, "connection");
        connectionCb = cb;
      },
    };
    registerSocketHandlers(io, null);
    assert.strictEqual(typeof connectionCb, "function");

    const onCalls = [];
    const socket = {
      id: "test-id",
      join: () => {},
      leave: () => {},
      emit: () => {},
      to: () => ({ emit: () => {} }),
      on: (event, handler) => {
        onCalls.push({ event, handler: typeof handler });
      },
    };
    connectionCb(socket);

    const events = onCalls.map((c) => c.event).sort();
    assert.ok(events.includes("join_blob"), "should register join_blob (blob refresh)");
    assert.ok(events.includes("leave_blob"), "should register leave_blob");
    assert.ok(events.includes("join_room"), "should register join_room (voice group)");
    assert.ok(events.includes("leave_room"), "should register leave_room");
    assert.ok(events.includes("signal"), "should register signal (voice 1:1)");
    assert.ok(events.includes("join"), "should register join (voice 1:1)");
    assert.ok(events.includes("leave"), "should register leave");
  });

  it("join_blob adds socket to blob:keyHash room", () => {
    const rooms = new Map();
    let connectionCb;
    const io = {
      on: (_, cb) => { connectionCb = cb; },
      sockets: { adapter: { rooms: { get: (id) => rooms.get(id) ?? null } } },
      to: () => ({ emit: () => {} }),
    };
    registerSocketHandlers(io, null);

    const joined = [];
    const socket = {
      id: "s1",
      join: (room) => joined.push(room),
      leave: () => {},
      emit: () => {},
      to: () => ({ emit: () => {} }),
      on: (event, handler) => {
        if (event === "join_blob") joinBlobHandler = handler;
      },
    };
    let joinBlobHandler;
    connectionCb(socket);
    joinBlobHandler("abcKeyHash123");
    assert.strictEqual(joined[0], "blob:abcKeyHash123");
  });

  it("signal forwards payload to target with from", () => {
    const emitted = [];
    let connectionCb;
    const io = {
      on: (_, cb) => { connectionCb = cb; },
      sockets: { adapter: { rooms: { get: () => null } } },
      to: (target) => ({
        emit: (event, payload) => emitted.push({ target, event, payload }),
      }),
    };
    registerSocketHandlers(io, null);

    const socket = {
      id: "sender-id",
      join: () => {},
      leave: () => {},
      emit: () => {},
      to: () => ({ emit: () => {} }),
      on: (event, handler) => {
        if (event === "signal") signalHandler = handler;
      },
    };
    let signalHandler;
    connectionCb(socket);
    signalHandler({ to: "receiver-id", type: "offer", sdp: {} });
    assert.strictEqual(emitted.length, 1);
    assert.strictEqual(emitted[0].target, "receiver-id");
    assert.strictEqual(emitted[0].event, "signal");
    assert.strictEqual(emitted[0].payload.from, "sender-id");
    assert.strictEqual(emitted[0].payload.type, "offer");
  });
});
