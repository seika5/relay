/**
 * Identity file (keys + contacts + groups) and contact card file format.
 * User "logs in" by loading identity file; adds contacts by loading contact card files.
 */

export type Contact = {
  keyHash: string;
  publicKey: string;
  name?: string;
};

export type Group = {
  id: string;
  name?: string;
  members: Contact[];
};

export type IdentityFile = {
  version: 1;
  keyHash: string;
  privateKeyJwk: JsonWebKey;
  publicKeyBase64: string;
  contacts: Contact[];
  groups: Group[];
};

export type ContactCardFile = {
  keyHash: string;
  publicKey: string;
  name?: string;
};

const IDENTITY_FILE_PREFIX = "relay-identity-v1";
const CONTACT_CARD_PREFIX = "relay-contact-v1";

export function parseIdentityFile(json: string): IdentityFile {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (raw?.version !== 1 || !raw.keyHash || !raw.privateKeyJwk || !raw.publicKeyBase64) {
    throw new Error("Invalid identity file");
  }
  return {
    version: 1,
    keyHash: raw.keyHash as string,
    privateKeyJwk: raw.privateKeyJwk as JsonWebKey,
    publicKeyBase64: raw.publicKeyBase64 as string,
    contacts: Array.isArray(raw.contacts) ? (raw.contacts as Contact[]) : [],
    groups: Array.isArray(raw.groups) ? (raw.groups as Group[]) : [],
  };
}

export function serializeIdentityFile(data: IdentityFile): string {
  return JSON.stringify(data, null, 0);
}

export function downloadIdentityFile(data: IdentityFile, filename?: string): void {
  const blob = new Blob([serializeIdentityFile(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename ?? `${IDENTITY_FILE_PREFIX}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function parseContactCardFile(json: string): ContactCardFile {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (!raw?.keyHash || !raw?.publicKey) throw new Error("Invalid contact card file");
  return {
    keyHash: raw.keyHash as string,
    publicKey: raw.publicKey as string,
    name: raw.name as string | undefined,
  };
}

export function serializeContactCardFile(data: ContactCardFile): string {
  return JSON.stringify(data);
}

export function downloadContactCardFile(data: ContactCardFile, name?: string): void {
  const blob = new Blob([serializeContactCardFile(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name ? `relay-contact-${name.replace(/\s+/g, "-")}.json` : `${CONTACT_CARD_PREFIX}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function isIdentityFile(json: string): boolean {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return raw?.version === 1 && !!raw.keyHash && !!raw.privateKeyJwk && !!raw.publicKeyBase64;
  } catch {
    return false;
  }
}

export function isContactCardFile(json: string): boolean {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return !!raw?.keyHash && !!raw?.publicKey && typeof raw.keyHash === "string" && typeof raw.publicKey === "string";
  } catch {
    return false;
  }
}
