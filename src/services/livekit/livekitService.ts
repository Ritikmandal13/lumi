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
let activeCallbacks: LiveSessionCallbacks | null = null;
let currentConnectionState: ConnectionState = 'idle';
let currentVideoTrack: RemoteTrack | null = null;
const videoTrackListeners = new Set<(track: RemoteTrack | null) => void>();

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

export function getRobotVideoTrack(): RemoteTrack | null {
  return currentVideoTrack;
}

export async function setRobotMicrophone(enabled: boolean): Promise<void> {
  if (!activeRoom || !activeRoom.localParticipant) return;
  try {
    await activeRoom.localParticipant.setMicrophoneEnabled(enabled);
  } catch (err) {
    console.warn('[LiveKit] Failed to toggle microphone:', err);
  }
}

export const livekitLiveService: LiveService = {
  async connect(robotId: string, callbacks: LiveSessionCallbacks): Promise<void> {
    // If already connected to another room, disconnect first
    if (activeRoom) {
      await this.disconnect();
    }

    activeCallbacks = callbacks;
    currentConnectionState = 'connecting';
    callbacks.onConnectionStateChange('connecting');

    try {
      // 1. Request signed LiveKit token from Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('user-token', {
        body: { robot_id: robotId },
      });

      if (error) {
        let msg = error.message || 'Failed to authenticate live session';
        try {
          if ('context' in error && (error as any).context && typeof (error as any).context.json === 'function') {
            const parsed = await (error as any).context.json();
            if (parsed?.error) msg = parsed.error;
          }
        } catch {}
        currentConnectionState = 'ended';
        callbacks.onConnectionStateChange('ended');
        callbacks.onError(msg);
        return;
      }

      const { token, url } = data;
      if (!token || !url) {
        throw new Error('LiveKit room connection credentials missing.');
      }

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
        currentConnectionState = 'ended';
        activeCallbacks?.onConnectionStateChange('ended');
        notifyVideoTrackListeners(null);
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

      // Data Channel: telemetry from robot
      room.on(
        RoomEvent.DataReceived,
        (
          payload: Uint8Array,
          participant?: RemoteParticipant,
          kind?: any,
          topic?: string
        ) => {
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
    currentConnectionState = 'ended';
    if (activeCallbacks) {
      activeCallbacks.onConnectionStateChange('ended');
      activeCallbacks = null;
    }

    notifyVideoTrackListeners(null);

    if (activeRoom) {
      try {
        await activeRoom.disconnect();
      } catch (err) {
        console.warn('[LiveKit] Error disconnecting room:', err);
      }
      activeRoom = null;
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

let directRobotIp: string | null = null;

export function setDirectRobotIp(ip: string | null): void {
  directRobotIp = ip;
}

export function getDirectRobotIp(): string | null {
  return directRobotIp;
}

export const livekitControlChannel: ControlChannel = {
  send(message: ControlMessage): void {
    // If direct local IP is configured, send HTTP commands with minimal latency
    if (directRobotIp) {
      if (message.t === 'drive') {
        fetch(`http://${directRobotIp}/drive?x=${message.x}&y=${message.y}`).catch(() => {});
      } else if (message.t === 'stop') {
        fetch(`http://${directRobotIp}/stop`).catch(() => {});
      }
    }

    if (!activeRoom || !activeRoom.localParticipant) {
      return;
    }

    try {
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(message));
      // Use lossy for frequent joystick drive packets, reliable for discrete commands
      const reliable = message.t !== 'drive';
      activeRoom.localParticipant.publishData(payload, { reliable });
    } catch (err) {
      console.warn('[LiveKit] Error sending control packet:', err);
    }
  },

  startDriving(x: number, y: number): void {
    this.send({ t: 'drive', x, y });
  },

  stopDriving(): void {
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
};
