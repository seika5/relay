/**
 * Chunked blob encrypt/decrypt: build DecryptedMessage -> chunk -> encrypt each -> 65536-byte packets;
 * receive packets -> decrypt -> ChunkPlaintext -> reassemble -> DecryptedMessage.
 */

import { importPublicKey, deriveAesKey, deriveAesKeyFromEcdhHkdf, encrypt, decrypt } from "./crypto";
import { exportPublicKey } from "./e2ee";
import {
  type DecryptedMessage,
  encodeMessage,
  decodeMessage,
  chunkPayload,
  reassemblePayload,
  buildBlobPacket,
  parseBlobPacket,
  uuidToBytes,
  type ChunkPlaintext,
  BLOB_SIZE,
} from "./blobPayload";

/** Encrypt a message for one recipient; returns one or more blob packets (each BLOB_SIZE bytes). */
export async function encryptMessageToBlobPackets(
  myKeyPair: CryptoKeyPair,
  recipientPublicKeyBase64: string,
  message: DecryptedMessage
): Promise<ArrayBuffer[]> {
  const fullJson = encodeMessage(message);
  const chunks = chunkPayload(fullJson);
  const messageId = chunks[0].messageId;
  const theirPublic = await importPublicKey(recipientPublicKeyBase64);
  const info = uuidToBytes(messageId);
  const sharedKey = await deriveAesKeyFromEcdhHkdf(myKeyPair.privateKey, theirPublic, info);
  const senderPublicKey = await exportPublicKey(myKeyPair.publicKey);
  const packets: ArrayBuffer[] = [];
  for (const chunk of chunks) {
    const plain = new TextEncoder().encode(JSON.stringify(chunk));
    const ciphertext = await encrypt(sharedKey, plain, info);
    const packet = buildBlobPacket(senderPublicKey, ciphertext, messageId);
    if (packet.byteLength !== BLOB_SIZE) throw new Error("Blob packet wrong size");
    packets.push(packet);
  }
  return packets;
}

/** Decrypt one blob packet; returns ChunkPlaintext (for reassembly) or null if decrypt fails. */
export async function decryptBlobPacketToChunk(
  myKeyPair: CryptoKeyPair,
  packet: ArrayBuffer
): Promise<ChunkPlaintext | null> {
  try {
    const { senderPublicKeyBase64, ciphertext, messageId } = parseBlobPacket(packet);
    const senderPublic = await importPublicKey(senderPublicKeyBase64);
    const sharedKey =
      messageId != null
        ? await deriveAesKeyFromEcdhHkdf(myKeyPair.privateKey, senderPublic, uuidToBytes(messageId))
        : await deriveAesKey(myKeyPair.privateKey, senderPublic);
    const aad = messageId != null ? uuidToBytes(messageId) : undefined;
    const plain = await decrypt(sharedKey, ciphertext, aad);
    const chunk = JSON.parse(new TextDecoder().decode(plain)) as ChunkPlaintext;
    if (typeof chunk.messageId !== "string" || typeof chunk.chunkIndex !== "number" || typeof chunk.totalChunks !== "number" || typeof chunk.fragmentBase64 !== "string") {
      return null;
    }
    return chunk;
  } catch {
    return null;
  }
}

/** Reassemble chunks (same messageId) into one DecryptedMessage. */
export function reassembleChunksToMessage(chunks: ChunkPlaintext[]): DecryptedMessage | null {
  if (chunks.length === 0) return null;
  try {
    const fullJson = reassemblePayload(chunks);
    return decodeMessage(fullJson);
  } catch {
    return null;
  }
}
