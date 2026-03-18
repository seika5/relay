/**
 * Unit tests for call room id: deterministic, URL-safe room id per conversation.
 */
import { describe, it, expect } from "vitest";
import { getRoomIdForConversation } from "../callRoom";
import type { Conversation } from "@/lib/useMessages";

describe("getRoomIdForConversation", () => {
  it("returns a string with room- prefix", async () => {
    const conv: Conversation = { type: "dm", otherKeyHash: "other" };
    const room = await getRoomIdForConversation(conv, "me");
    expect(room).toMatch(/^room-/);
    expect(typeof room).toBe("string");
  });

  it("is deterministic for same DM", async () => {
    const conv: Conversation = { type: "dm", otherKeyHash: "aa" };
    const a = await getRoomIdForConversation(conv, "bb");
    const b = await getRoomIdForConversation(conv, "bb");
    expect(a).toBe(b);
  });

  it("same two members produce same room regardless of order (DM)", async () => {
    const conv1: Conversation = { type: "dm", otherKeyHash: "alice" };
    const conv2: Conversation = { type: "dm", otherKeyHash: "bob" };
    const room1 = await getRoomIdForConversation(conv1, "bob");
    const room2 = await getRoomIdForConversation(conv2, "alice");
    expect(room1).toBe(room2);
  });

  it("is deterministic for same group", async () => {
    const conv: Conversation = {
      type: "group",
      memberKeyHashes: ["a", "b", "c"],
    };
    const a = await getRoomIdForConversation(conv, "a");
    const b = await getRoomIdForConversation(conv, "a");
    expect(a).toBe(b);
  });

  it("same group members in different order produce same room", async () => {
    const conv1: Conversation = {
      type: "group",
      memberKeyHashes: ["a", "b", "c"],
    };
    const conv2: Conversation = {
      type: "group",
      memberKeyHashes: ["c", "a", "b"],
    };
    const room1 = await getRoomIdForConversation(conv1, "a");
    const room2 = await getRoomIdForConversation(conv2, "a");
    expect(room1).toBe(room2);
  });

  it("is URL-safe (no +, /, or =)", async () => {
    const conv: Conversation = { type: "dm", otherKeyHash: "x" };
    const room = await getRoomIdForConversation(conv, "y");
    expect(room).not.toMatch(/\+|\/|=/);
  });
});
