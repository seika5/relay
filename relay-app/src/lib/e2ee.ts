/**
 * Per-recipient E2EE: encrypt with ECDH(my private, recipient public).
 * Payload includes senderPublicKey so recipient can derive same key and attribute sender.
 */

import {
  exportPublicKey,
  importPublicKey,
  deriveAesKey,
  encrypt,
  decrypt,
  sha256Hex,
} from "./crypto";
import { encodePayload, decodePayload, type BlobPayload } from "./blobPayload";

export type { BlobPayload };

/** Server-facing blob: sender public key (for recipient to derive key) + ciphertext. */
export type EncryptedBlobPayload = {
  senderPublicKey: string;
  ciphertext: string; // base64
};

/**
 * Encrypt a payload for a recipient. Only they can decrypt.
 * Returns payload to send to server (opaque except senderPublicKey for key derivation).
 */
export async function encryptForRecipient(
  myKeyPair: CryptoKeyPair,
  recipientPublicKeyBase64: string,
  payload: BlobPayload
): Promise<EncryptedBlobPayload> {
  const theirPublic = await importPublicKey(recipientPublicKeyBase64);
  const sharedKey = await deriveAesKey(myKeyPair.privateKey, theirPublic);
  const raw = new TextEncoder().encode(encodePayload(payload));
  const cipher = await encrypt(sharedKey, raw);
  const senderPublicKey = await exportPublicKey(myKeyPair.publicKey);
  return {
    senderPublicKey,
    ciphertext: btoa(String.fromCharCode.apply(null, Array.from(cipher))),
  };
}

/**
 * Decrypt a blob from a sender. Call with senderPublicKey from the blob.
 */
export async function decryptFromSender(
  myKeyPair: CryptoKeyPair,
  senderPublicKeyBase64: string,
  ciphertextBase64: string
): Promise<BlobPayload> {
  const senderPublic = await importPublicKey(senderPublicKeyBase64);
  const sharedKey = await deriveAesKey(myKeyPair.privateKey, senderPublic);
  const ciphertext = Uint8Array.from(atob(ciphertextBase64), (c) => c.charCodeAt(0));
  const plain = await decrypt(sharedKey, ciphertext);
  return decodePayload(new TextDecoder().decode(plain));
}

/** Returns SHA-256 hex of the public key (for addressing and allowlist). */
export async function getKeyHashFromKeyPair(pair: CryptoKeyPair): Promise<string> {
  const pubB64 = await exportPublicKey(pair.publicKey);
  return sha256Hex(pubB64);
}

export { exportPublicKey } from "./crypto";
