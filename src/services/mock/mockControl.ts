/**
 * Mock Control Channel
 * Logs every message to the console and to a developer overlay.
 */

import type { ControlMessage } from '../../types';
import type { ControlChannel } from '../interfaces';

const messageLog: { timestamp: number; message: ControlMessage }[] = [];

export const mockControlChannel: ControlChannel = {
  send(message: ControlMessage): void {
    const entry = { timestamp: Date.now(), message };
    messageLog.push(entry);
    // Keep log size manageable
    if (messageLog.length > 200) messageLog.splice(0, 100);
    console.log('[ControlChannel]', JSON.stringify(message));
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

// For developer overlay
export function getMessageLog() {
  return [...messageLog];
}
