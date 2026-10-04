/**
 * Mock Live Service
 * Connecting takes 2-3 seconds.
 * Sends fake telemetry (latency 40-120ms, battery drifts).
 */

import type { ConnectionState, Telemetry } from '../../types';
import type { LiveService, LiveSessionCallbacks } from '../interfaces';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let connectionState: ConnectionState = 'idle';
let telemetryInterval: ReturnType<typeof setInterval> | null = null;
let callbacks: LiveSessionCallbacks | null = null;
let batteryBase = 82;

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function stopTelemetry() {
  if (telemetryInterval) {
    clearInterval(telemetryInterval);
    telemetryInterval = null;
  }
}

function startTelemetry() {
  stopTelemetry();
  telemetryInterval = setInterval(() => {
    if (!callbacks) return;
    // Drift battery slowly
    batteryBase = Math.max(5, batteryBase - (Math.random() > 0.9 ? 1 : 0));
    const telemetry: Telemetry = {
      batteryPercent: batteryBase,
      wifiSignal: (randomBetween(2, 4) as 2 | 3 | 4),
      latencyMs: randomBetween(40, 120),
      currentEmotion: 'happy',
    };
    callbacks.onTelemetry(telemetry);
  }, 3000);
}

export const mockLiveService: LiveService = {
  async connect(robotId: string, cbs: LiveSessionCallbacks): Promise<void> {
    callbacks = cbs;

    connectionState = 'connecting';
    cbs.onConnectionStateChange('connecting');

    // Simulate connection steps
    await delay(1000);
    await delay(randomBetween(1000, 2000));

    connectionState = 'connected';
    cbs.onConnectionStateChange('connected');
    batteryBase = 82;
    startTelemetry();
  },

  async disconnect(): Promise<void> {
    stopTelemetry();
    connectionState = 'ended';
    if (callbacks) {
      callbacks.onConnectionStateChange('ended');
    }
    callbacks = null;
    connectionState = 'idle';
  },

  getConnectionState(): ConnectionState {
    return connectionState;
  },
};

// Developer menu helpers for simulating states
export const mockLiveDevTools = {
  simulateWeakConnection() {
    connectionState = 'weak';
    callbacks?.onConnectionStateChange('weak');
  },
  simulateReconnecting() {
    connectionState = 'reconnecting';
    callbacks?.onConnectionStateChange('reconnecting');
    stopTelemetry();
    // Auto-reconnect after 5s
    setTimeout(() => {
      connectionState = 'connected';
      callbacks?.onConnectionStateChange('connected');
      startTelemetry();
    }, 5000);
  },
  simulateRobotOffline() {
    connectionState = 'robotOffline';
    callbacks?.onConnectionStateChange('robotOffline');
    stopTelemetry();
  },
  simulateLowBattery() {
    batteryBase = 12;
  },
};
