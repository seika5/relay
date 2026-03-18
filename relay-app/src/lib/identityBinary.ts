/**
 * Binary identity format:
 * - version (1B): 1 = no display names; 2 = displayName per contact; 3 = + myUserNumber (2B, 1-20); 4 = + volume per contact (2B, 0-100).
 * - keyHash len+bytes, publicKey len+bytes, privateKey JWK len+bytes, contacts count (2B).
 * - Per contact: keyHash len+bytes, publicKey len+bytes; if version >= 2: displayName len (2B) + utf8; if version >= 4: volume (2B, 0-100, default 100).
 * - If version >= 3: myUserNumber (2B big-endian, 1-20) so UI can show "Me (User nn)".
 * All multi-byte lengths big-endian.
 */

export type Contact = {
  keyHash: string;
  publicKey: string;
  displayName: string;
  /** 0-100. Only present when version >= 4; default 100. */
  volume?: number;
};

export type IdentityData = {
  version: number;
  keyHash: string;
  publicKeyBase64: string;
  privateKeyJwk: JsonWebKey;
  contacts: Contact[];
  /** 1-20 for "Me (User 01)" etc.; only present when version >= 3. */
  myUserNumber?: number;
};

const VERSION = 4;

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function readString(view: DataView, buf: Uint8Array, offset: { value: number }, len: number): string {
  const s = new TextDecoder().decode(buf.subarray(offset.value, offset.value + len));
  offset.value += len;
  return s;
}

function readBytes(buf: Uint8Array, offset: { value: number }, len: number): Uint8Array {
  const slice = buf.slice(offset.value, offset.value + len);
  offset.value += len;
  return slice;
}

export function parseIdentityBinary(buf: ArrayBuffer): IdentityData {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const o = { value: 0 };

  const version = view.getUint8(o.value);
  o.value += 1;
  if (version < 1 || version > 4) throw new Error("Unsupported identity binary version");

  const keyHashLen = readU16(view, o.value);
  o.value += 2;
  const keyHash = readString(view, bytes, o, keyHashLen);

  const pubKeyLen = readU16(view, o.value);
  o.value += 2;
  const pubKeyBytes = readBytes(bytes, o, pubKeyLen);
  const publicKeyBase64 = btoa(String.fromCharCode(...pubKeyBytes));

  const privKeyLen = readU32(view, o.value);
  o.value += 4;
  const privKeyJson = readString(view, bytes, o, privKeyLen);
  const privateKeyJwk = JSON.parse(privKeyJson) as JsonWebKey;

  const contactsCount = readU16(view, o.value);
  o.value += 2;
  const contacts: Contact[] = [];
  for (let i = 0; i < contactsCount; i++) {
    const cKeyHashLen = readU16(view, o.value);
    o.value += 2;
    const cKeyHash = readString(view, bytes, o, cKeyHashLen);
    const cPubLen = readU16(view, o.value);
    o.value += 2;
    const cPubBytes = readBytes(bytes, o, cPubLen);
    const cPublicKey = btoa(String.fromCharCode(...cPubBytes));
    let displayName = `User ${String(i + 1).padStart(2, "0")}`;
    if (version >= 2) {
      const dnLen = readU16(view, o.value);
      o.value += 2;
      displayName = readString(view, bytes, o, dnLen) || displayName;
    }
    let volume = 100;
    if (version >= 4 && o.value + 2 <= bytes.length) {
      volume = Math.min(100, Math.max(0, readU16(view, o.value)));
      o.value += 2;
    }
    contacts.push({ keyHash: cKeyHash, publicKey: cPublicKey, displayName, volume });
  }

  let myUserNumber: number | undefined;
  if (version >= 3 && o.value + 2 <= bytes.length) {
    myUserNumber = view.getUint16(o.value, false);
    if (myUserNumber < 1 || myUserNumber > 20) myUserNumber = undefined;
  }

  return {
    version,
    keyHash,
    publicKeyBase64,
    privateKeyJwk,
    contacts,
    myUserNumber,
  };
}

/** Write identity to binary (for script or export). */
export function writeIdentityBinary(data: IdentityData): Uint8Array {
  const keyHashBytes = new TextEncoder().encode(data.keyHash);
  const pubKeyBytes = Uint8Array.from(atob(data.publicKeyBase64), (c) => c.charCodeAt(0));
  const privKeyJson = JSON.stringify(data.privateKeyJwk);
  const privKeyBytes = new TextEncoder().encode(privKeyJson);

  const parts: Uint8Array[] = [];
  const push = (arr: Uint8Array) => parts.push(arr);

  const u8 = (n: number) => new Uint8Array([n]);
  const u16 = (n: number) => {
    const a = new Uint8Array(2);
    new DataView(a.buffer).setUint16(0, n, false);
    return a;
  };
  const u32 = (n: number) => {
    const a = new Uint8Array(4);
    new DataView(a.buffer).setUint32(0, n, false);
    return a;
  };

  push(u8(VERSION));
  push(u16(keyHashBytes.length));
  push(keyHashBytes);
  push(u16(pubKeyBytes.length));
  push(pubKeyBytes);
  push(u32(privKeyBytes.length));
  push(privKeyBytes);
  push(u16(data.contacts.length));

  for (const c of data.contacts) {
    const cKeyHashBytes = new TextEncoder().encode(c.keyHash);
    const cPubBytes = Uint8Array.from(atob(c.publicKey), (ch) => ch.charCodeAt(0));
    const displayName = c.displayName ?? `User 00`;
    const dnBytes = new TextEncoder().encode(displayName);
    const volume = Math.min(100, Math.max(0, c.volume ?? 100));
    push(u16(cKeyHashBytes.length));
    push(cKeyHashBytes);
    push(u16(cPubBytes.length));
    push(cPubBytes);
    push(u16(dnBytes.length));
    push(dnBytes);
    push(u16(volume));
  }

  const myUserNumber = data.myUserNumber != null && data.myUserNumber >= 1 && data.myUserNumber <= 20 ? data.myUserNumber : undefined;
  if (myUserNumber != null) push(u16(myUserNumber));

  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
