"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { importKeyPair, exportPrivateKey } from "@/lib/crypto";
import { getKeyHashFromKeyPair } from "@/lib/e2ee";
import { checkAllowed } from "@/lib/api";
import { parseIdentityBinary, writeIdentityBinary, type Contact } from "@/lib/identityBinary";

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
  logout: () => void;
};

const IdentityContext = createContext<IdentityContextValue | null>(null);

const IDENTITY_BIN_PATH = "/identity/identity.bin";
const IDENTITY_API_PATH = "/api/identity";

async function persistIdentityBinary(identity: IdentityState): Promise<void> {
  const privateKeyJwk = await exportPrivateKey(identity.keyPair.privateKey);
  const data = {
    version: 4,
    keyHash: identity.keyHash,
    publicKeyBase64: identity.publicKeyBase64,
    privateKeyJwk,
    contacts: identity.contacts,
    myUserNumber: identity.myUserNumber,
  };
  const bytes = writeIdentityBinary(data);
  const res = await fetch(IDENTITY_API_PATH, {
    method: "PUT",
    body: bytes,
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Failed to save identity (${res.status})`);
  }
}

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
      setIdentity({
        keyPair,
        keyHash: data.keyHash,
        publicKeyBase64: data.publicKeyBase64,
        contacts: data.contacts,
        myUserNumber: data.myUserNumber,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      setError(message === "Failed to fetch" ? "Could not reach the server. Is it running? Check NEXT_PUBLIC_API_URL." : message);
      throw e;
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  useEffect(() => {
    setError(null);
    fetch(IDENTITY_BIN_PATH)
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

  const getDisplayName = useCallback((keyHash: string): string | undefined => {
    return identity?.contacts.find((c) => c.keyHash === keyHash)?.displayName;
  }, [identity?.contacts]);

  const getContactVolume = useCallback((keyHash: string): number => {
    const v = identity?.contacts.find((c) => c.keyHash === keyHash)?.volume;
    return typeof v === "number" ? Math.min(100, Math.max(0, v)) : 100;
  }, [identity?.contacts]);

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
