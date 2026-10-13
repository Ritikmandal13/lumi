/**
 * LiveKit WebRTC Live & Control Service
 * Handles live video, audio, telemetry, and low-latency robot control commands.
 */

import {
  Room,
  RoomEvent,
  Track,
  ConnectionQuality,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from 'livekit-client';
import { AudioSession } from '@livekit/react-native';
import { supabase } from '../../lib/supabase';
import type {
  ConnectionState,
  ControlMessage,
  Telemetry,
} from '../../types';
import type {
  LiveService,
  ControlChannel,
  LiveSessionCallbacks,
} from '../interfaces';

let activeRoom: Room | null = null;
let activeRobotId: string | null = null;
let activeCallbacks: LiveSessionCallbacks | null = null;
let currentConnectionState: ConnectionState = 'idle';
let currentVideoTrack: RemoteTrack | null = null;
const videoTrackListeners = new Set<(track: RemoteTrack | null) => void>();

const cloudVideoListeners = new Set<(uri: string | null) => void>();
let latestCloudVideoUri: string | null = null;

export function getActiveRobotId(): string | null {
  return activeRobotId;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.byteLength;
  let i = 0;
  while (i < len) {
    const b0 = bytes[i++];
    const b1 = i < len ? bytes[i++] : NaN;
    const b2 = i < len ? bytes[i++] : NaN;

    const n = (b0 << 16) | (isNaN(b1) ? 0 : b1 << 8) | (isNaN(b2) ? 0 : b2);

    result += B64_CHARS[(n >> 18) & 63];
    result += B64_CHARS[(n >> 12) & 63];
    result += isNaN(b1) ? '=' : B64_CHARS[(n >> 6) & 63];
    result += isNaN(b2) ? '=' : B64_CHARS[n & 63];
  }
  return result;
}

function notifyVideoTrackListeners(track: RemoteTrack | null) {
  currentVideoTrack = track;
  videoTrackListeners.forEach((listener) => {
    try {
      listener(track);
    } catch (e) {
      console.warn('[LiveKit] Error in video track listener:', e);
    }
  });
}

function notifyCloudVideoFrame(uri: string | null) {
  latestCloudVideoUri = uri;
  cloudVideoListeners.forEach((listener) => {
    try {
      listener(uri);
    } catch (e) {
      console.warn('[LiveKit] Error in cloud video listener:', e);
    }
  });
}

export function subscribeToRobotVideoTrack(
  listener: (track: RemoteTrack | null) => void
): () => void {
  videoTrackListeners.add(listener);
  // Immediately notify with current track if exists
  listener(currentVideoTrack);
  return () => {
    videoTrackListeners.delete(listener);
  };
}

export function subscribeToCloudVideoFrame(
  listener: (uri: string | null) => void
): () => void {
  cloudVideoListeners.add(listener);
  listener(latestCloudVideoUri);
  return () => {
    cloudVideoListeners.delete(listener);
  };
}

export function getRobotVideoTrack(): RemoteTrack | null {
  return currentVideoTrack;
}

export async function setRobotMicrophone(_enabled: boolean): Promise<void> {
  // Intentionally NO-OP for WebRTC audio tracks to prevent ESP32 client-sdk-esp32 DTLS crash (-30848).
  // Walkie-Talkie Push-to-Talk (PTT) is handled strictly over reliable Data Channel ('mic_start'/'mic_stop').
}

interface CachedToken {
  token: string;
  url: string;
  robotId: string;
  expiresAt: number;
}

let cachedSessionToken: CachedToken | null = null;
let isIntentionalDisconnect = false;

async function fetchLiveKitCredentialsWithRetry(
  robotId: string,
  maxRetries = 3
): Promise<{ token: string; url: string }> {
  // 1. Check valid in-memory cache first (valid for 90m) to instantly bypass cold starts and transient 503s
  if (
    cachedSessionToken &&
    cachedSessionToken.robotId === robotId &&
    Date.now() < cachedSessionToken.expiresAt
  ) {
    console.log('[LiveKit] Using valid cached session token for robot:', robotId);
    return { token: cachedSessionToken.token, url: cachedSessionToken.url };
  }

  let lastError: any = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[LiveKit] Requesting user-token from Edge Function (attempt ${attempt}/${maxRetries})...`);
      const { data, error } = await supabase.functions.invoke('user-token', {
        body: { robot_id: robotId },
      });

      if (!error && data?.token && data?.url) {
        // Cache token (Edge function default is 2 hours; cache for 90m to be safe)
        const ttlMs = (data.expires_in ? Number(data.expires_in) - 300 : 5400) * 1000;
        cachedSessionToken = {
          token: data.token,
          url: data.url,
          robotId,
          expiresAt: Date.now() + Math.max(ttlMs, 60000),
        };
        return { token: data.token, url: data.url };
      }

      lastError = error;
      console.warn(`[LiveKit] user-token attempt ${attempt} failed:`, error?.message);
    } catch (err: any) {
      lastError = err;
      console.warn(`[LiveKit] user-token network attempt ${attempt} error:`, err?.message);
    }

    if (attempt < maxRetries) {
      // Exponential backoff: 800ms, 1600ms
      await new Promise((res) => setTimeout(res, 800 * attempt));
    }
  }

  // If all retries fail, parse readable error message
  let msg = lastError?.message || 'Failed to authenticate live session';
  try {
    if (
      lastError &&
      'context' in lastError &&
      lastError.context &&
      typeof lastError.context.json === 'function'
    ) {
      const parsed = await lastError.context.json();
      if (parsed?.error) msg = parsed.error;
    }
  } catch {}
  throw new Error(msg);
}

export const livekitLiveService: LiveService = {
  async connect(robotId: string, callbacks: LiveSessionCallbacks): Promise<void> {
    isIntentionalDisconnect = false;

    // 1. If already connected to the same robot with a healthy active room, reuse active session seamlessly
    if (
      activeRoom &&
      activeRoom.state === 'connected' &&
      activeRobotId === robotId &&
      (currentConnectionState === 'connected' || currentConnectionState === 'weak')
    ) {
      console.log('[LiveKit] Reusing active session for robot:', robotId);
      activeCallbacks = callbacks;
      callbacks.onConnectionStateChange(currentConnectionState);
      if (currentVideoTrack) {
        notifyVideoTrackListeners(currentVideoTrack);
      }
      if (latestCloudVideoUri) {
        notifyCloudVideoFrame(latestCloudVideoUri);
      }
      return;
    }

    // 2. If an existing or stale room exists, cleanly disconnect first
    if (activeRoom) {
      await this.disconnect();
      isIntentionalDisconnect = false;
    }

    activeRobotId = robotId;
    activeCallbacks = callbacks;
    currentConnectionState = 'connecting';
    callbacks.onConnectionStateChange('connecting');

    try {
      // 1. Request signed LiveKit token with auto-retry and cache
      let creds: { token: string; url: string };
      try {
        creds = await fetchLiveKitCredentialsWithRetry(robotId, 3);
      } catch (err: any) {
        currentConnectionState = 'ended';
        callbacks.onConnectionStateChange('ended');
        callbacks.onError(err.message || 'Cloud Connection Error');
        return;
      }

      const { token, url } = creds;

      // 2. Start native audio session
      try {
        await AudioSession.startAudioSession();
      } catch (audioErr) {
        console.warn('[LiveKit] AudioSession init warning:', audioErr);
      }

      // 3. Create LiveKit Room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      activeRoom = room;

      // 4. Attach Event Listeners
      room.on(RoomEvent.Connected, () => {
        currentConnectionState = 'connected';
        activeCallbacks?.onConnectionStateChange('connected');
      });

      room.on(RoomEvent.Reconnecting, () => {
        currentConnectionState = 'reconnecting';
        activeCallbacks?.onConnectionStateChange('reconnecting');
      });

      room.on(RoomEvent.Reconnected, () => {
        currentConnectionState = 'connected';
        activeCallbacks?.onConnectionStateChange('connected');
      });

      room.on(RoomEvent.Disconnected, () => {
        console.log('[LiveKit] Room disconnected. Intentional:', isIntentionalDisconnect);
        notifyVideoTrackListeners(null);
        notifyCloudVideoFrame(null);
        currentVideoTrack = null;
        latestCloudVideoUri = null;

        if (!isIntentionalDisconnect && activeRobotId === robotId) {
          console.log('[LiveKit] Connection dropped unexpectedly. Attempting auto-reconnect...');
          currentConnectionState = 'reconnecting';
          callbacks.onConnectionStateChange('reconnecting');
          setTimeout(() => {
            if (!isIntentionalDisconnect && activeRobotId === robotId) {
              livekitLiveService.connect(robotId, callbacks).catch((err) => {
                console.warn('[LiveKit] Auto-reconnect failed:', err);
              });
            }
          }, 1500);
        } else {
          currentConnectionState = 'ended';
          activeRobotId = null;
          activeRoom = null;
          activeCallbacks?.onConnectionStateChange('ended');
          activeCallbacks = null;
        }
      });

      room.on(RoomEvent.ConnectionQualityChanged, (quality: ConnectionQuality) => {
        if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) {
          activeCallbacks?.onConnectionStateChange('weak');
        } else if (quality === ConnectionQuality.Excellent || quality === ConnectionQuality.Good) {
          if (currentConnectionState === 'weak') {
            currentConnectionState = 'connected';
            activeCallbacks?.onConnectionStateChange('connected');
          }
        }
      });

      // Track subscriptions: robot video & audio
      room.on(
        RoomEvent.TrackSubscribed,
        (
          track: RemoteTrack,
          publication: RemoteTrackPublication,
          participant: RemoteParticipant
        ) => {
          if (track.kind === Track.Kind.Video) {
            notifyVideoTrackListeners(track);
          }
        }
      );

      room.on(
        RoomEvent.TrackUnsubscribed,
        (
          track: RemoteTrack,
          publication: RemoteTrackPublication,
          participant: RemoteParticipant
        ) => {
          if (track.kind === Track.Kind.Video) {
            notifyVideoTrackListeners(null);
          }
        }
      );

      // Data Channel: video stream and telemetry from robot
      room.on(
        RoomEvent.DataReceived,
        (
          payload: Uint8Array,
          participant?: RemoteParticipant,
          kind?: any,
          topic?: string
        ) => {
          // 1. Worldwide LiveKit WebRTC Video Frame (topic 'video' or raw JPEG header)
          if (topic === 'video' || (payload.length > 4 && payload[0] === 0xFF && payload[1] === 0xD8)) {
            // Verify full complete JPEG frame with both SOI (0xFF, 0xD8) and EOI (0xFF, 0xD9)
            // Dropped SCTP network chunks will be discarded immediately to prevent black flicker!
            if (payload.length > 4 && payload[payload.length - 2] === 0xFF && payload[payload.length - 1] === 0xD9) {
              const base64 = uint8ArrayToBase64(payload);
              const frameUri = `data:image/jpeg;base64,${base64}`;
              notifyCloudVideoFrame(frameUri);
            }
            return;
          }

          // 2. Real-time Telemetry
          try {
            const decoder = new TextDecoder();
            const text = decoder.decode(payload);
            const data = JSON.parse(text);

            if (data.t === 'telemetry' || data.batteryPercent !== undefined || data.battery !== undefined) {
              const telemetry: Telemetry = {
                batteryPercent: data.batteryPercent ?? data.battery ?? 100,
                wifiSignal: data.wifiSignal ?? data.wifi ?? 4,
                latencyMs: data.latencyMs ?? 50,
                currentEmotion: data.currentEmotion ?? data.emotion,
              };
              if (data.ip) {
                (telemetry as any).ip = data.ip;
              }
              activeCallbacks?.onTelemetry(telemetry);
            }
          } catch {
            // Ignore non-json or unparsed data
          }
        }
      );

      // 5. Connect to LiveKit
      await room.connect(url, token);

      // Check if robot is already publishing a video track
      for (const participant of room.remoteParticipants.values()) {
        for (const pub of participant.videoTrackPublications.values()) {
          if (pub.track && pub.isSubscribed) {
            notifyVideoTrackListeners(pub.track);
            break;
          }
        }
      }
    } catch (err: any) {
      currentConnectionState = 'ended';
      callbacks.onConnectionStateChange('ended');
      callbacks.onError(err.message || 'Connection failed');
    }
  },

  async disconnect(): Promise<void> {
    isIntentionalDisconnect = true;
    currentConnectionState = 'ended';
    activeRobotId = null;
    if (activeCallbacks) {
      activeCallbacks.onConnectionStateChange('ended');
      activeCallbacks = null;
    }

    notifyVideoTrackListeners(null);
    notifyCloudVideoFrame(null);
    currentVideoTrack = null;
    latestCloudVideoUri = null;

    if (activeRoom) {
      const roomToDisconnect = activeRoom;
      activeRoom = null;
      try {
        await roomToDisconnect.disconnect();
      } catch (err) {
        console.warn('[LiveKit] Error disconnecting room:', err);
      }
    }

    try {
      await AudioSession.stopAudioSession();
    } catch (audioErr) {
      console.warn('[LiveKit] AudioSession stop warning:', audioErr);
    }
  },

  getConnectionState(): ConnectionState {
    return currentConnectionState;
  },
};


export const livekitControlChannel: ControlChannel = {
  send(message: ControlMessage): void {
    if (!activeRoom || !activeRoom.localParticipant) {
      return;
    }

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(message));
      // Send reliably across the dedicated _reliable SCTP channel (stream_id: 1)
      // which the ESP32 LiveKit C SDK is actively listening to
      const reliable = true;
      activeRoom.localParticipant
        .publishData(payload, {
          reliable,
          topic: message.t,
        })
        .catch((err) => {
          console.warn(`[LiveKit] Failed to publish ${message.t}:`, err);
        });
    } catch (err) {
      console.warn('[LiveKit] Error sending control packet:', err);
    }
  },

  startDriving(x: number, y: number): void {
    this.send({ t: 'drive', x, y });
  },

  stopDriving(): void {
    this.send({ t: 'drive', x: 0, y: 0 });
    this.send({ t: 'stop' });
  },

  sendEmotion(name: string): void {
    this.send({ t: 'emotion', name });
  },

  sendGesture(name: string): void {
    this.send({ t: 'play', name });
  },

  setVolume(value: number): void {
    this.send({ t: 'volume', value });
  },

  sendVoice(base64Data: string): void {
    this.send({ t: 'voice', data: base64Data });
  },

  sendVoiceBytes(bytes: Uint8Array): void {
    if (!activeRoom || !activeRoom.localParticipant) {
      return;
    }
    try {
      activeRoom.localParticipant
        .publishData(bytes as any, {
          reliable: false, // Lossy UDP stream for low-latency live PCM audio
          topic: 'voice_stream',
        })
        .catch((err) => {
          console.warn('[LiveKit] Error sending voice packet:', err);
        });
    } catch (err) {
      console.warn('[LiveKit] Error sending voice packet:', err);
    }
  },
};
