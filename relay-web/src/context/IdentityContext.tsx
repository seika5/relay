"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { importKeyPair, exportPrivateKey } from "@/lib/crypto";
import { getKeyHashFromKeyPair } from "@/lib/e2ee";
import { checkAllowed } from "@/lib/api";
import { parseIdentityBinary, writeIdentityBinary, type Contact } from "@/lib/identityBinary";

const IS_NATIVE = Capacitor.isNativePlatform();

/** Path for identity file in the app Documents directory (native only). */
const NATIVE_IDENTITY_FILE = "identity.bin";
/** Path for identity served statically (web only). */
const WEB_IDENTITY_PATH = "/identity/identity.bin";
/** Web API route for auto-save (web only, localhost-gated). */
const IDENTITY_API_PATH = "/api/identity";

type IdentityState = {
  keyPair: CryptoKeyPair;
  keyHash: string;
  publicKeyBase64: string;
  contacts: Contact[];
  /** 1-20 for "Me (User 01)" display; from identity binary v3. */
  myUserNumber?: number;
};

type IdentityContextValue = {
  identity: IdentityState | null;
  /** True until the initial identity fetch (identity.bin) has completed. */
  loading: boolean;
  error: string | null;
  dismissError: () => void;
  loadIdentityFromBytes: (buffer: ArrayBuffer) => Promise<void>;
  addContact: (contact: Contact) => void;
  removeContact: (keyHash: string) => void;
  setDisplayName: (keyHash: string, displayName: string) => Promise<void>;
  getDisplayName: (keyHash: string) => string | undefined;
  /** 0-100. Stored in identity binary (v4); in-memory updates until identity file is replaced. */
  getContactVolume: (keyHash: string) => number;
  setContactVolume: (keyHash: string, volume: number) => void;
  /** Label shown in parentheses for "Me (...)" e.g. "User 01". */
  getMyDisplayName: () => string;
  /**
   * Web: downloads updated identity.bin via browser anchor.
   * Native: saves to Documents directory and opens the iOS share sheet.
   */
  saveIdentityBinary: () => Promise<void>;
  logout: () => void;
};

const IdentityContext = createContext<IdentityContextValue | null>(null);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the raw identity bytes from the current in-memory state. */
async function buildIdentityBytes(identity: IdentityState): Promise<Uint8Array> {
  const privateKeyJwk = await exportPrivateKey(identity.keyPair.privateKey);
  return writeIdentityBinary({
    version: 4,
    keyHash: identity.keyHash,
    publicKeyBase64: identity.publicKeyBase64,
    privateKeyJwk,
    contacts: identity.contacts,
    myUserNumber: identity.myUserNumber,
  });
}

/**
 * Persist identity to disk.
 * Native: writes to the app Documents directory via @capacitor/filesystem.
 * Web:    PUTs to /api/identity (localhost-only; 403 on remote hosts is silently ignored).
 */
async function persistIdentityBinary(identity: IdentityState): Promise<void> {
  const bytes = await buildIdentityBytes(identity);

  if (IS_NATIVE) {
    const base64 = btoa(String.fromCharCode(...Array.from(bytes)));
    await Filesystem.writeFile({
      path: NATIVE_IDENTITY_FILE,
      data: base64,
      directory: Directory.Documents,
    });
    return;
  }

  // Web path: PUT to localhost-gated API route
  try {
    const res = await fetch(IDENTITY_API_PATH, {
      method: "PUT",
      body: bytes.buffer as ArrayBuffer,
      headers: { "Content-Type": "application/octet-stream" },
    });
    if (!res.ok && res.status !== 403) {
      console.warn("identity persist failed:", res.status);
    }
  } catch {
    // network error or non-localhost — silently ignore
  }
}

/** Convert a base64 string (from Filesystem.readFile on native) to an ArrayBuffer. */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Native identity scan
// ---------------------------------------------------------------------------

/**
 * Load the identity binary from the app Documents directory.
 * Tries NATIVE_IDENTITY_FILE ("identity.bin") first; if not present, scans for
 * the first .bin file the user dragged in (e.g. "identity-01.bin").
 * On success, the accepted file is saved as "identity.bin" for subsequent launches.
 */
async function loadNativeIdentity(): Promise<ArrayBuffer> {
  // Fast path: already saved as identity.bin
  try {
    const result = await Filesystem.readFile({
      path: NATIVE_IDENTITY_FILE,
      directory: Directory.Documents,
    });
    const buf = base64ToArrayBuffer(result.data as string);
    if (buf.byteLength > 0) return buf;
  } catch {
    // Not present yet — fall through to scan.
  }

  // Scan Documents for any .bin file dropped in by the user.
  const dir = await Filesystem.readdir({ path: "", directory: Directory.Documents });
  const binEntry = dir.files.find((f) => f.name.endsWith(".bin"));
  if (!binEntry) throw new Error("no .bin file found");

  const result = await Filesystem.readFile({
    path: binEntry.name,
    directory: Directory.Documents,
  });
  const buf = base64ToArrayBuffer(result.data as string);
  if (buf.byteLength === 0) throw new Error("empty .bin file");

  // Canonicalise to identity.bin so future launches hit the fast path.
  await Filesystem.rename({
    from: binEntry.name,
    to: NATIVE_IDENTITY_FILE,
    directory: Directory.Documents,
  });

  return buf;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<IdentityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIdentityFromBytes = useCallback(async (buffer: ArrayBuffer) => {
    setError(null);
    try {
      const data = parseIdentityBinary(buffer);
      const keyPair = await importKeyPair(data.privateKeyJwk, data.publicKeyBase64);
      if (data.keyHash !== (await getKeyHashFromKeyPair(keyPair))) {
        throw new Error("Identity key hash does not match keypair");
      }
      const allowed = await checkAllowed(data.keyHash);
      if (!allowed) {
        throw new Error("This identity is not registered. Only pre-distributed identities can use this server.");
      }
      const next: IdentityState = {
        keyPair,
        keyHash: data.keyHash,
        publicKeyBase64: data.publicKeyBase64,
        contacts: data.contacts,
        myUserNumber: data.myUserNumber,
      };
      setIdentity(next);
      // On native: persist accepted identity to Documents so it loads automatically next launch.
      if (IS_NATIVE) {
        await persistIdentityBinary(next).catch(() => {});
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      // "Failed to fetch" = browser/CORS network error
      // "Load failed"    = iOS WKWebView error (ATS block or unreachable host)
      // "NetworkError …" = Firefox equivalent
      const isNetworkError = [
        "Failed to fetch",
        "Load failed",
        "NetworkError when attempting to fetch resource.",
      ].includes(message);
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      setError(
        isNetworkError
          ? `Cannot reach the server (${serverUrl}).\n\nMake sure:\n• The relay server is running\n• This device is on the same network as the server\n• The server URL in the build is correct`
          : message
      );
      throw e;
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  // Initial identity load
  useEffect(() => {
    setError(null);

    if (IS_NATIVE) {
      // Native: try identity.bin first; if missing, scan Documents for any .bin file
      // (supports the Files-app drag-in workflow where the file retains its original name).
      loadNativeIdentity()
        .then(
          // Success: file found — hand off to identity validation.
          // loadIdentityFromBytes sets its own errors; don't catch them here.
          (buf) => loadIdentityFromBytes(buf).catch(() => {}),
          // Failure: no .bin file in Documents — show the "where to put it" message.
          () => {
            setError(
              "No identity found. Share your identity file to Relay: in Files, tap the .bin file and choose \u201cOpen with Relay\u201d."
            );
          }
        )
        .finally(() => setLoading(false));
      return;
    }

    // Web: fetch from the static public/identity/ path.
    fetch(WEB_IDENTITY_PATH)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((buf) => {
        if (buf && buf.byteLength > 0) {
          loadIdentityFromBytes(buf).catch(() => {});
        } else {
          setError("Identity file not found or empty.");
        }
      })
      .catch(() => {
        setError("Identity file not found or could not be loaded.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadIdentityFromBytes]);

  // Native only: when "Open with Relay" is used (AirDrop / Files app),
  // AppDelegate.swift writes the file to Documents/identity.bin then calls webView.reload().
  // The page re-mounts and loadNativeIdentity picks up the file automatically.
  // No additional JS listener needed here.

  const addContact = useCallback((contact: Contact) => {
    setIdentity((prev) => {
      if (!prev) return prev;
      if (prev.contacts.some((c) => c.keyHash === contact.keyHash)) return prev;
      const displayName = contact.displayName?.trim() || `User ${String(prev.contacts.length + 1).padStart(2, "0")}`;
      return { ...prev, contacts: [...prev.contacts, { ...contact, displayName, volume: contact.volume ?? 100 }] };
    });
  }, []);

  const removeContact = useCallback((keyHash: string) => {
    setIdentity((prev) => (prev ? { ...prev, contacts: prev.contacts.filter((c) => c.keyHash !== keyHash) } : prev));
  }, []);

  const setDisplayName = useCallback((keyHash: string, displayName: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      setIdentity((prev) => {
        if (!prev) {
          reject(new Error("No identity"));
          return prev;
        }
        const trimmed = displayName.trim() || undefined;
        const contacts = prev.contacts.map((c) =>
          c.keyHash === keyHash ? { ...c, displayName: trimmed || c.displayName } : c
        );
        const next = { ...prev, contacts };
        queueMicrotask(() => {
          persistIdentityBinary(next)
            .then(resolve)
            .catch((e) => {
              setError(e instanceof Error ? e.message : "Failed to save name");
              reject(e);
            });
        });
        return next;
      });
    });
  }, []);

  const getDisplayName = useCallback(
    (keyHash: string): string | undefined => identity?.contacts.find((c) => c.keyHash === keyHash)?.displayName,
    [identity?.contacts]
  );

  const getContactVolume = useCallback(
    (keyHash: string): number => {
      const v = identity?.contacts.find((c) => c.keyHash === keyHash)?.volume;
      return typeof v === "number" ? Math.min(100, Math.max(0, v)) : 100;
    },
    [identity?.contacts]
  );

  const setContactVolume = useCallback((keyHash: string, volume: number) => {
    const v = Math.min(100, Math.max(0, Math.round(volume)));
    let next: IdentityState | null = null;
    setIdentity((prev) => {
      if (!prev) return prev;
      const contacts = prev.contacts.map((c) =>
        c.keyHash === keyHash ? { ...c, volume: v } : c
      );
      next = { ...prev, contacts };
      return next;
    });
    if (next) persistIdentityBinary(next).catch((e) => setError(e instanceof Error ? e.message : "Failed to save volume"));
  }, []);

  const getMyDisplayName = useCallback((): string => {
    const n = identity?.myUserNumber;
    if (n != null && n >= 1 && n <= 20) return `User ${String(n).padStart(2, "0")}`;
    return "Me";
  }, [identity?.myUserNumber]);

  const saveIdentityBinary = useCallback(async (): Promise<void> => {
    if (!identity) throw new Error("No identity loaded");
    const bytes = await buildIdentityBytes(identity);

    if (IS_NATIVE) {
      // Save updated file to Documents, then open the share sheet.
      const base64 = btoa(String.fromCharCode(...Array.from(bytes)));
      const writeResult = await Filesystem.writeFile({
        path: NATIVE_IDENTITY_FILE,
        data: base64,
        directory: Directory.Documents,
      });
      await Share.share({
        title: "identity.bin",
        text: "Relay identity file",
        url: writeResult.uri,
      });
      return;
    }

    // Web: trigger browser download.
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "identity.bin";
    a.click();
    URL.revokeObjectURL(a.href);
  }, [identity]);

  const logout = useCallback(() => setIdentity(null), []);

  return (
    <IdentityContext.Provider
      value={{
        identity,
        loading,
        error,
        dismissError,
        loadIdentityFromBytes,
        addContact,
        removeContact,
        setDisplayName,
        getDisplayName,
        getContactVolume,
        setContactVolume,
        getMyDisplayName,
        saveIdentityBinary,
        logout,
      }}
    >
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error("useIdentity must be used within IdentityProvider");
  return ctx;
}
