"use client";

import { useRef, useEffect } from "react";
import { useCall } from "@/context/CallContext";
import { useIdentity } from "@/context/IdentityContext";

/**
 * When the call is minimized (not expanded), play all remote streams so audio works
 * without having to expand the call view. Respects deafen: when deafened we don't play.
 * Applies per-contact volume (0-100).
 */
export function RemoteCallAudio() {
  const { remoteStreams, inCall, callExpanded, deafened, peerKeyHashes } = useCall();
  const { getContactVolume } = useIdentity();
  if (!inCall || callExpanded || deafened) return null;
  return (
    <>
      {Array.from(remoteStreams.entries()).map(
        ([peerId, stream]) =>
          stream.getAudioTracks().length > 0 && (
            <RemoteStreamAudio
              key={peerId}
              stream={stream}
              volume={(() => {
                const keyHash = peerKeyHashes.get(peerId);
                return keyHash != null ? getContactVolume(keyHash) : 100;
              })()}
            />
          )
      )}
    </>
  );
}

function RemoteStreamAudio({ stream, volume }: { stream: MediaStream; volume: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const gain = Math.min(1, Math.max(0, volume / 100));
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.volume = gain;
    }
    return () => {
      if (ref.current) ref.current.srcObject = null;
    };
  }, [stream, gain]);
  useEffect(() => {
    if (ref.current) ref.current.volume = gain;
  }, [gain]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}
