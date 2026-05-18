import type { MutableRefObject } from "react";

/**
 * For remote streams with multiple video tracks (e.g. camera then screen), pick the live one
 * so the video element shows the active track instead of a stopped one (black).
 */
export function getDisplayStreamForVideo(
  stream: MediaStream | null,
  isLocal: boolean
): MediaStream | null {
  if (!stream || isLocal) return stream;
  const v = stream.getVideoTracks();
  if (v.length <= 1) return stream;
  const preferred = v.find((t) => t.readyState === "live") ?? v[v.length - 1];
  return new MediaStream([...stream.getAudioTracks(), preferred]);
}

export type ParticipantSource = {
  key: string;
  participantId: string;
  isLocal: boolean;
  stream: MediaStream;
};

/**
 * Discord-style: one tile per video source. Local can have camera tile + screen tile;
 * each remote can have camera tile + screen tile. Order: camera first, then screen.
 */
export function getParticipantSources(
  localStream: MediaStream | null,
  remoteStreams: Map<string, MediaStream>,
  cameraOn: boolean,
  screenSharing: boolean,
  cameraTrackRef: MutableRefObject<MediaStreamTrack | null>,
  screenTrackRef: MutableRefObject<MediaStreamTrack | null>
): ParticipantSource[] {
  const out: ParticipantSource[] = [];
  const cam = cameraTrackRef.current;
  const screen = screenTrackRef.current;
  if (localStream && cam) {
    out.push({
      key: "local-camera",
      participantId: "local",
      isLocal: true,
      stream: new MediaStream([...localStream.getAudioTracks(), cam]),
    });
  }
  if (screen) {
    out.push({
      key: "local-screen",
      participantId: "local",
      isLocal: true,
      stream: new MediaStream([screen]),
    });
  }
  remoteStreams.forEach((stream, peerId) => {
    const videoTracks = stream.getVideoTracks().filter((t) => t.readyState === "live");
    const audioTracks = stream.getAudioTracks();
    videoTracks.forEach((track, i) => {
      const streamForTile =
        i === 0
          ? new MediaStream([...audioTracks, track])
          : new MediaStream([track]);
      out.push({
        key: `${peerId}-${i}`,
        participantId: peerId,
        isLocal: false,
        stream: streamForTile,
      });
    });
    // Audio-only remote: one tile so they appear and their audio is played (fixes "no audio until camera on").
    if (videoTracks.length === 0 && audioTracks.length > 0) {
      out.push({
        key: `${peerId}-audio`,
        participantId: peerId,
        isLocal: false,
        stream: new MediaStream(audioTracks),
      });
    }
  });
  return out;
}
