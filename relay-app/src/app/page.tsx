"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { useIdentity } from "@/context/IdentityContext";
import { useCall } from "@/context/CallContext";
import { CompactCallTile } from "@/components/CallTile";
import { InlineCallView } from "@/components/InlineCallView";
import { RemoteCallAudio } from "@/components/RemoteCallAudio";
import { useMessages, type Conversation, conversationId, messageBelongsToConversation } from "@/lib/useMessages";
import { getRoomIdForConversation } from "@/lib/callRoom";
import type { DecryptedMessage } from "@/lib/blobPayload";

function conversationLabel(
  conv: Conversation,
  myKeyHash: string,
  getDisplayName: (k: string) => string | undefined,
  groupNames: Map<string, string>
): string {
  if (conv.type === "dm") {
    const other = conv.otherKeyHash;
    return getDisplayName(other) || other.slice(0, 8);
  }
  const n = conv.memberKeyHashes.length;
  const name = groupNames.get(conversationId(conv, myKeyHash)) || "Group Chat";
  return `${name} (${n})`;
}

export default function Home() {
  const { identity, loading, error: identityError, getDisplayName, getMyDisplayName, setDisplayName } = useIdentity();
  const { inCall, callExpanded, muted, deafened, cameraOn, screenSharing, currentCallConversation, setMuted, setDeafened, setCameraOn, setScreenSharing, hangUp, setCurrentCallConversation, setCallExpanded, startOrJoinCall, roomJoinError, dismissRoomJoinError } = useCall();
  const { messages, conversations, sendMessage, error } = useMessages(identity);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupSelected, setNewGroupSelected] = useState<Set<string>>(new Set());
  const [displayNameModal, setDisplayNameModal] = useState<{ keyHash: string } | null>(null);
  const [displayNameValue, setDisplayNameValue] = useState("");
  const [displayNameSaveError, setDisplayNameSaveError] = useState<string | null>(null);
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [groupRenameModal, setGroupRenameModal] = useState<Conversation | null>(null);
  const [groupRenameValue, setGroupRenameValue] = useState("");
  const [callRoomId, setCallRoomId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesListRef = useRef<HTMLUListElement>(null);
  const wasAtBottomRef = useRef(true);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const b64 = (r.result as string).split(",")[1];
        resolve(b64 ?? "");
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });

  useEffect(() => {
    if (!selected || !identity) {
      setCallRoomId(null);
      return;
    }
    let cancelled = false;
    getRoomIdForConversation(selected, identity.keyHash).then((id) => {
      if (!cancelled) setCallRoomId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, identity?.keyHash]);

  const filteredMessages = useMemo(() => {
    if (!selected || !identity) return [];
    return messages.filter((m) => messageBelongsToConversation(m, selected, identity.keyHash));
  }, [messages, selected, identity?.keyHash]);

  const groupNamesFromMessages = useMemo(() => {
    const map = new Map<string, string>();
    if (!identity) return map;
    for (const conv of conversations) {
      if (conv.type !== "group") continue;
      const cid = conversationId(conv, identity.keyHash);
      const renames = messages.filter(
        (m) => m.type === "group_rename" && messageBelongsToConversation(m, conv, identity.keyHash)
      );
      const sorted = [...renames].sort((a, b) => b.sentAt - a.sentAt);
      const last = sorted[0];
      if (last && last.type === "group_rename") map.set(cid, last.newName);
    }
    return map;
  }, [conversations, messages, identity?.keyHash]);

  // Auto-scroll to bottom when send/receive if user was already at bottom
  const prevFilteredLengthRef = useRef(0);
  useEffect(() => {
    const list = messagesListRef.current;
    if (!list) return;
    if (filteredMessages.length > prevFilteredLengthRef.current && wasAtBottomRef.current) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    }
    prevFilteredLengthRef.current = filteredMessages.length;
  }, [filteredMessages.length, filteredMessages]);

  const handleMessagesScroll = () => {
    const list = messagesListRef.current;
    if (!list) return;
    wasAtBottomRef.current =
      list.scrollHeight - list.clientHeight <= list.scrollTop + 80;
  };

  useEffect(() => {
    wasAtBottomRef.current = true;
  }, [selected]);

  // Scroll to bottom when switching to a conversation
  useEffect(() => {
    const list = messagesListRef.current;
    if (list && selected) {
      requestAnimationFrame(() => {
        list.scrollTop = list.scrollHeight;
      });
    }
  }, [selected]);

  const keyHashesWithDm = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      if (c.type === "dm") set.add(c.otherKeyHash);
    }
    return set;
  }, [conversations]);
  const contactsWithoutDmSorted = useMemo(() => {
    const list =
      identity?.contacts.filter((c) => c.keyHash !== identity.keyHash && !keyHashesWithDm.has(c.keyHash)) ?? [];
    return [...list].sort((a, b) => {
      const na = getDisplayName(a.keyHash) || a.keyHash;
      const nb = getDisplayName(b.keyHash) || b.keyHash;
      return na.localeCompare(nb, undefined, { numeric: true });
    });
  }, [identity?.contacts, keyHashesWithDm, getDisplayName]);

  const handleSend = async () => {
    if (!identity || (!input.trim() && pendingFiles.length === 0)) return;
    const recipients =
      selected?.type === "dm"
        ? [selected.otherKeyHash]
        : selected?.type === "group"
          ? selected.memberKeyHashes.filter((k) => k !== identity.keyHash)
          : [];
    const opts =
      selected?.type === "dm"
        ? { recipientKeyHash: selected.otherKeyHash }
        : selected?.type === "group"
          ? {}
          : {};

    if (input.trim()) {
      if (selected?.type === "dm") {
        await sendMessage(
          { type: "text", body: input.trim() } as Omit<DecryptedMessage, "senderKeyHash" | "sentAt">,
          recipients,
          { recipientKeyHash: selected.otherKeyHash }
        );
      } else if (selected?.type === "group") {
        await sendMessage(
          { type: "text", body: input.trim(), groupMemberKeyHashes: selected.memberKeyHashes } as Omit<DecryptedMessage, "senderKeyHash" | "sentAt">,
          recipients
        );
      }
      setInput("");
    }

    for (const file of pendingFiles) {
      const body = await readFileAsBase64(file);
      const fileMsg = {
        type: "file" as const,
        body,
        filename: file.name,
        fileSize: file.size,
        ...(selected?.type === "group" ? { groupMemberKeyHashes: selected.memberKeyHashes } : {}),
      };
      if (selected?.type === "dm") {
        await sendMessage(fileMsg as Omit<DecryptedMessage, "senderKeyHash" | "sentAt">, recipients, opts);
      } else if (selected?.type === "group") {
        await sendMessage(fileMsg as Omit<DecryptedMessage, "senderKeyHash" | "sentAt">, recipients);
      }
    }
    setPendingFiles([]);
  };

  const handleCreateGroup = () => {
    if (newGroupSelected.size === 0) return;
    const conv: Conversation = {
      type: "group",
      memberKeyHashes: [identity!.keyHash, ...Array.from(newGroupSelected)],
    };
    setSelected(conv);
    setNewGroupOpen(false);
    setNewGroupSelected(new Set());
  };

  const handleStartCall = async () => {
    if (!identity || !selected || !callRoomId) return;
    setCurrentCallConversation(selected);
    const allowedKeyHashes =
      selected.type === "dm"
        ? [identity.keyHash, selected.otherKeyHash].sort()
        : [...selected.memberKeyHashes].sort();
    const sendStartedIfFirst = async () => {
      if (!selected || !identity) return;
      if (selected.type === "dm") {
        await sendMessage(
          { type: "call_event", event: "started", recipientKeyHash: selected.otherKeyHash } as Omit<DecryptedMessage, "senderKeyHash" | "sentAt">,
          [selected.otherKeyHash],
          { recipientKeyHash: selected.otherKeyHash }
        );
      } else {
        await sendMessage(
          { type: "call_event", event: "started", groupMemberKeyHashes: selected.memberKeyHashes } as Omit<DecryptedMessage, "senderKeyHash" | "sentAt">,
          selected.memberKeyHashes.filter((k) => k !== identity.keyHash)
        );
      }
    };
    await startOrJoinCall(callRoomId, identity.keyHash, allowedKeyHashes, sendStartedIfFirst);
  };

  const handleHangUp = async () => {
    const conv = currentCallConversation;
    const wasLast = await hangUp(callRoomId ?? undefined);
    if (wasLast && identity && conv) {
      if (conv.type === "dm") {
        await sendMessage(
          { type: "call_event", event: "ended", recipientKeyHash: conv.otherKeyHash } as Omit<DecryptedMessage, "senderKeyHash" | "sentAt">,
          [conv.otherKeyHash],
          { recipientKeyHash: conv.otherKeyHash }
        );
      } else {
        await sendMessage(
          { type: "call_event", event: "ended", groupMemberKeyHashes: conv.memberKeyHashes } as Omit<DecryptedMessage, "senderKeyHash" | "sentAt">,
          conv.memberKeyHashes.filter((k) => k !== identity.keyHash)
        );
      }
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-[var(--bg)]" />;
  }
  if (!identity) {
    const message = identityError ?? "Something went wrong.";
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg)] text-[var(--text)]">
        <h1 className="text-xl font-semibold text-[var(--text)] mb-2">Relay</h1>
        <p className="text-[var(--muted)] text-center max-w-md mb-4">{message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded bg-[var(--accent)] text-white text-sm"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="flex h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col border-r border-[var(--border)] bg-[var(--surface)]">
        <div className="p-2 font-semibold border-b border-[var(--border)]">Chats</div>
        <button
          type="button"
          onClick={() => setNewGroupOpen(true)}
          className="m-2 py-1.5 rounded text-sm bg-[var(--border)] hover:bg-[var(--accent)]/20 text-[var(--text)]"
        >
          + New group
        </button>
        <ul className="flex-1 overflow-auto">
          {conversations.map((conv) => (
            <li key={conv.type === "dm" ? `dm:${conv.otherKeyHash}` : `g:${[...conv.memberKeyHashes].sort().join(",")}`}>
              <button
                type="button"
                onClick={() => {
                  setSelected(conv);
                  if (inCall) setCallExpanded(false);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (conv.type === "dm") {
                    setDisplayNameModal({ keyHash: conv.otherKeyHash });
                    setDisplayNameSaveError(null);
                    setDisplayNameValue(getDisplayName(conv.otherKeyHash) ?? "");
                  } else {
                    setGroupRenameModal(conv);
                    setGroupRenameValue(groupNamesFromMessages.get(conversationId(conv, identity.keyHash)) || "Group Chat");
                  }
                }}
                className={`w-full text-left px-3 py-2 rounded truncate text-sm ${
                  selected?.type === conv.type &&
                  (conv.type === "dm"
                    ? selected.type === "dm" && selected.otherKeyHash === conv.otherKeyHash
                    : selected.type === "group" &&
                      selected.memberKeyHashes.length === conv.memberKeyHashes.length &&
                      [...selected.memberKeyHashes].sort().join() === [...conv.memberKeyHashes].sort().join())
                    ? "bg-[var(--accent)]/30"
                    : "hover:bg-[var(--border)]"
                }`}
              >
                {conversationLabel(conv, identity.keyHash, getDisplayName, groupNamesFromMessages)}
              </button>
            </li>
          ))}
          {contactsWithoutDmSorted.map((c) => (
            <li key={`contact:${c.keyHash}`}>
              <button
                type="button"
                onClick={() => {
                  setSelected({ type: "dm", otherKeyHash: c.keyHash });
                  if (inCall) setCallExpanded(false);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setDisplayNameModal({ keyHash: c.keyHash });
                  setDisplayNameSaveError(null);
                  setDisplayNameValue(getDisplayName(c.keyHash) ?? "");
                }}
                className={`w-full text-left px-3 py-2 rounded truncate text-sm ${
                  selected?.type === "dm" && selected.otherKeyHash === c.keyHash ? "bg-[var(--accent)]/30" : "hover:bg-[var(--border)]"
                }`}
              >
                {getDisplayName(c.keyHash) || c.keyHash.slice(0, 8)}
              </button>
            </li>
          ))}
        </ul>
        {/* Call controls only when in a call; sidebar otherwise looks like when not in a call */}
        {inCall && (
          <div className="p-2 border-t border-[var(--border)] flex flex-col gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              className={`w-full py-2 rounded text-sm font-medium ${muted ? "bg-amber-600/80 text-white" : "bg-[var(--border)] text-[var(--text)]"}`}
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              onClick={() => setDeafened(!deafened)}
              className={`w-full py-2 rounded text-sm font-medium ${deafened ? "bg-amber-600/80 text-white" : "bg-[var(--border)] text-[var(--text)]"}`}
            >
              {deafened ? "Undeafen" : "Deafen"}
            </button>
            <button
              type="button"
              onClick={() => setCameraOn(!cameraOn)}
              className={`w-full py-2 rounded text-sm font-medium ${cameraOn ? "bg-amber-600/80 text-white" : "bg-[var(--border)] text-[var(--text)]"}`}
            >
              {cameraOn ? "Camera off" : "Camera on"}
            </button>
            <button
              type="button"
              onClick={() => setScreenSharing(!screenSharing)}
              className={`w-full py-2 rounded text-sm font-medium ${screenSharing ? "bg-amber-600/80 text-white" : "bg-[var(--border)] text-[var(--text)]"}`}
            >
              {screenSharing ? "Stop share" : "Share screen"}
            </button>
            <button type="button" onClick={handleHangUp} className="w-full py-2 rounded text-sm font-medium bg-red-600/80 text-white">
              Hang up
            </button>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {roomJoinError && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-900/40 border-b border-amber-600/50 text-sm text-amber-200">
            <span>{roomJoinError}</span>
            <button type="button" onClick={dismissRoomJoinError} className="px-2 py-1 rounded hover:bg-amber-600/30">
              Dismiss
            </button>
          </div>
        )}
        {inCall && !callExpanded && (
          <>
            <RemoteCallAudio />
            <div
              className="absolute top-2 right-2 z-10 w-48 rounded overflow-hidden border border-[var(--border)] bg-[var(--surface)] cursor-pointer shadow-lg"
              onClick={() => setCallExpanded(true)}
              title="Click to expand call"
            >
              <CompactCallTile />
            </div>
          </>
        )}
        {inCall && callExpanded ? (
          <InlineCallView />
        ) : selected ? (
          <>
            <div className="p-2 border-b border-[var(--border)] flex items-center justify-between gap-2">
              <span className="text-sm text-[var(--muted)]">
                {conversationLabel(selected, identity.keyHash, getDisplayName, groupNamesFromMessages)}
              </span>
              {callRoomId && !inCall && (
                <button
                  type="button"
                  onClick={handleStartCall}
                  className="py-1.5 px-3 rounded text-sm bg-[var(--accent)] text-white font-medium hover:opacity-90"
                >
                  Call
                </button>
              )}
            </div>
            <ul
              ref={messagesListRef}
              onScroll={handleMessagesScroll}
              className="flex-1 overflow-auto p-3 space-y-2"
            >
              {filteredMessages.map((m, i) => (
                <li key={i} className="text-sm">
                  {m.type === "call_event" ? (
                    <>
                      <span className="text-[var(--muted)]">{new Date(m.sentAt).toLocaleString()}</span>
                      <br />
                      <span className="italic text-[var(--muted)]">
                        {m.event === "started"
                          ? `${m.senderKeyHash === identity.keyHash ? "You (" + getMyDisplayName() + ")" : getDisplayName(m.senderKeyHash) || m.senderKeyHash.slice(0, 8)} started a call`
                          : `Call ended at ${new Date(m.sentAt).toLocaleString()}`}
                      </span>
                    </>
                  ) : m.type === "group_rename" ? (
                    <>
                      <span className="text-[var(--muted)]">{new Date(m.sentAt).toLocaleString()}</span>
                      <br />
                      <span className="italic text-[var(--muted)]">
                        {m.senderKeyHash === identity.keyHash
                          ? "You (" + getMyDisplayName() + ")"
                          : getDisplayName(m.senderKeyHash) || m.senderKeyHash.slice(0, 8)}{" "}
                        renamed the group to {m.newName}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[var(--muted)]">
                        {m.senderKeyHash === identity.keyHash
                          ? "Me (" + getMyDisplayName() + ")"
                          : getDisplayName(m.senderKeyHash) || m.senderKeyHash.slice(0, 8)}
                      </span>{" "}
                      <span className="text-[var(--muted)]">{new Date(m.sentAt).toLocaleString()}</span>
                      <br />
                      {m.type === "text" && <span>{m.body}</span>}
                      {m.type === "file" && (
                        <span className="inline-flex items-center gap-2">
                          <span>[File: {m.filename || "file"}]</span>
                          <button
                            type="button"
                            onClick={() => {
                              const bin = Uint8Array.from(atob(m.body), (c) => c.charCodeAt(0));
                              const blob = new Blob([bin]);
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = m.filename || "download";
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="px-2 py-0.5 rounded text-xs bg-[var(--accent)] text-white hover:opacity-90"
                          >
                            Download
                          </button>
                        </span>
                      )}
                      {m.type === "contact" && <span>[Contact]</span>}
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div
              className="p-2 border-t border-[var(--border)] flex flex-col gap-2"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = Array.from(e.dataTransfer?.files ?? []);
                if (files.length) setPendingFiles((prev) => [...prev, ...files]);
              }}
            >
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 text-xs text-[var(--muted)]">
                  {pendingFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--border)]">
                      {f.name}
                      <button
                        type="button"
                        onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="hover:text-[var(--text)]"
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (files.length) setPendingFiles((prev) => [...prev, ...files]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded border border-[var(--border)] text-[var(--text)] hover:bg-[var(--border)]"
                  title="Attach file"
                >
                  📎
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Message..."
                  className="flex-1 px-3 py-2 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder-[var(--muted)]"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  className="px-4 py-2 rounded bg-[var(--accent)] text-white font-medium"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--muted)]">
            Select a chat or create a group
          </div>
        )}
      </div>

      {error && (
        <div className="fixed bottom-4 right-4 px-3 py-2 rounded bg-red-900/80 text-white text-sm">
          {error}
        </div>
      )}

      {/* New group modal */}
      {newGroupOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 w-full max-w-sm">
            <h2 className="font-semibold mb-2">New group</h2>
            <p className="text-sm text-[var(--muted)] mb-2">Select contacts to add.</p>
            <ul className="max-h-48 overflow-auto space-y-1 mb-4">
              {identity.contacts
                .filter((c) => c.keyHash !== identity.keyHash)
                .map((c) => (
                  <li key={c.keyHash}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newGroupSelected.has(c.keyHash)}
                        onChange={(e) => {
                          setNewGroupSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(c.keyHash);
                            else next.delete(c.keyHash);
                            return next;
                          });
                        }}
                      />
                      <span>{getDisplayName(c.keyHash) || c.keyHash.slice(0, 8)}</span>
                    </label>
                  </li>
                ))}
            </ul>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewGroupOpen(false)}
                className="flex-1 py-2 rounded border border-[var(--border)] text-[var(--text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateGroup}
                className="flex-1 py-2 rounded bg-[var(--accent)] text-white"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set display name modal */}
      {displayNameModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 w-full max-w-sm">
            <h2 className="font-semibold mb-2">Set display name</h2>
            <input
              type="text"
              value={displayNameValue}
              onChange={(e) => {
                setDisplayNameValue(e.target.value);
                setDisplayNameSaveError(null);
              }}
              placeholder="Name"
              className="w-full px-3 py-2 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] mb-4"
            />
            {displayNameSaveError && (
              <p className="text-sm text-red-500 mb-2">{displayNameSaveError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDisplayNameModal(null);
                  setDisplayNameSaveError(null);
                }}
                className="flex-1 py-2 rounded border border-[var(--border)]"
                disabled={displayNameSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const name = displayNameValue.trim() || getDisplayName(displayNameModal.keyHash) || displayNameModal.keyHash.slice(0, 8);
                  setDisplayNameSaveError(null);
                  setDisplayNameSaving(true);
                  try {
                    await setDisplayName(displayNameModal.keyHash, name);
                    setDisplayNameModal(null);
                    setDisplayNameValue("");
                  } catch (e) {
                    setDisplayNameSaveError(e instanceof Error ? e.message : "Failed to save name");
                  } finally {
                    setDisplayNameSaving(false);
                  }
                }}
                className="flex-1 py-2 rounded bg-[var(--accent)] text-white disabled:opacity-50"
                disabled={displayNameSaving}
              >
                {displayNameSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename group modal */}
      {groupRenameModal && groupRenameModal.type === "group" && identity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 w-full max-w-sm">
            <h2 className="font-semibold mb-2">Rename group</h2>
            <input
              type="text"
              value={groupRenameValue}
              onChange={(e) => setGroupRenameValue(e.target.value)}
              placeholder="Group name"
              className="w-full px-3 py-2 rounded bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setGroupRenameModal(null); setGroupRenameValue(""); }}
                className="flex-1 py-2 rounded border border-[var(--border)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const newName = groupRenameValue.trim() || "Group Chat";
                  await sendMessage(
                    {
                      type: "group_rename",
                      newName,
                      groupMemberKeyHashes: groupRenameModal.memberKeyHashes,
                    } as Omit<DecryptedMessage, "senderKeyHash" | "sentAt">,
                    groupRenameModal.memberKeyHashes.filter((k) => k !== identity.keyHash)
                  );
                  setGroupRenameModal(null);
                  setGroupRenameValue("");
                }}
                className="flex-1 py-2 rounded bg-[var(--accent)] text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
