/**
 * Unit tests for blob payload: message types (including group_rename), encode/decode.
 */
import { describe, it, expect } from "vitest";
import { encodeMessage, decodeMessage } from "../blobPayload";
import { conversationId } from "../useMessages";
import type { Conversation } from "../useMessages";

describe("blobPayload", () => {
  it("encodes and decodes group_rename message", () => {
    const msg = {
      senderKeyHash: "abc",
      sentAt: 123,
      type: "group_rename" as const,
      newName: "My Group",
      groupMemberKeyHashes: ["a", "b", "c"],
    };
    const encoded = encodeMessage(msg);
    const decoded = decodeMessage(encoded);
    expect(decoded).toEqual(msg);
    expect(decoded.type).toBe("group_rename");
  });

  it("encodes and decodes call_event ended", () => {
    const msg = {
      senderKeyHash: "x",
      sentAt: 456,
      type: "call_event" as const,
      event: "ended" as const,
      groupMemberKeyHashes: ["p", "q"],
    };
    const decoded = decodeMessage(encodeMessage(msg));
    expect(decoded.type).toBe("call_event");
    expect((decoded as typeof msg).event).toBe("ended");
  });
});

describe("conversationId", () => {
  it("returns stable id for group", () => {
    const conv: Conversation = { type: "group", memberKeyHashes: ["a", "b", "c"] };
    expect(conversationId(conv, "me")).toBe("group:a,b,c");
  });
});
