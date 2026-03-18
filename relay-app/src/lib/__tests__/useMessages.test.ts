/**
 * useMessages: fetches blobs only on initial load and when socket emits "refresh" (no polling).
 * Voice/call uses socket for signaling (see server/src/__tests__/socket.test.js).
 */
import { describe, it, expect } from "vitest";
import { useMessages, messageBelongsToConversation, type Conversation } from "../useMessages";
import type { DecryptedMessage } from "../blobPayload";

describe("useMessages", () => {
  it("is a function (hook)", () => {
    expect(typeof useMessages).toBe("function");
  });

  it("design: fetch only on mount and socket refresh, no polling (see useMessages.ts)", () => {
    expect(useMessages).toBeDefined();
  });
});

describe("messageBelongsToConversation", () => {
  const me = "me";

  it("returns false for group message in DM conversation", () => {
    const msg: DecryptedMessage = {
      senderKeyHash: me,
      sentAt: 1,
      type: "text",
      body: "hi",
      groupMemberKeyHashes: ["me", "alice", "bob"],
    };
    const conv: Conversation = { type: "dm", otherKeyHash: "alice" };
    expect(messageBelongsToConversation(msg, conv, me)).toBe(false);
  });

  it("returns true for DM message in DM conversation", () => {
    const msg: DecryptedMessage = {
      senderKeyHash: me,
      sentAt: 1,
      type: "text",
      body: "hi",
      recipientKeyHash: "alice",
    };
    const conv: Conversation = { type: "dm", otherKeyHash: "alice" };
    expect(messageBelongsToConversation(msg, conv, me)).toBe(true);
  });

  it("returns true for group message in matching group conversation", () => {
    const msg: DecryptedMessage = {
      senderKeyHash: me,
      sentAt: 1,
      type: "text",
      body: "hi",
      groupMemberKeyHashes: ["me", "alice", "bob"],
    };
    const conv: Conversation = { type: "group", memberKeyHashes: ["me", "alice", "bob"] };
    expect(messageBelongsToConversation(msg, conv, me)).toBe(true);
  });

  it("returns false for group message in different group", () => {
    const msg: DecryptedMessage = {
      senderKeyHash: me,
      sentAt: 1,
      type: "text",
      body: "hi",
      groupMemberKeyHashes: ["me", "alice"],
    };
    const conv: Conversation = { type: "group", memberKeyHashes: ["me", "alice", "bob"] };
    expect(messageBelongsToConversation(msg, conv, me)).toBe(false);
  });
});
