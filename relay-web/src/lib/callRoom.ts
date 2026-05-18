import type { Conversation } from "@/lib/useMessages";

/**
 * Deterministic, URL-safe room id for a conversation.
 * Same DM or group always maps to the same room (1:1 = group of 2).
 */
export async function getRoomIdForConversation(
  conv: Conversation,
  myKeyHash: string
): Promise<string> {
  const sorted =
    conv.type === "dm"
      ? [myKeyHash, conv.otherKeyHash].sort()
      : [...conv.memberKeyHashes].sort();
  const input = sorted.join(",");
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  const b64 = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return "room-" + b64;
}
