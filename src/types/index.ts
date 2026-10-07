/**
 * LUMI shared TypeScript types
 * From plan section 8
 */

import type { RobotColorKey } from '../theme/tokens';
export type { RobotColorKey };

export type Role = 'owner' | 'controller';
export type RobotStatus = 'online' | 'offline' | 'busy';

export interface Robot {
  id: string;
  name: string;
  color: string; // robot color key, e.g. 'violet'
  room?: string;
  role: Role;
  status: RobotStatus;
  batteryPercent: number | null;
  wifiSignal: 0 | 1 | 2 | 3 | 4 | null;
  firmwareVersion: string;
  lastSeenAt: string; // ISO date
  ownerName: string;
  remoteAccessEnabled: boolean;
  localIp?: string | null;
  capabilities: {
    emotions: string[];
    gestures: string[];
  };
}

export interface Session {
  id: string;
  robotId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  rating?: 'great' | 'ok' | 'problem';
  robotName?: string;
  userName?: string;
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'weak'
  | 'reconnecting'
  | 'robotOffline'
  | 'ended';

export type ControlMessage =
  | { t: 'drive'; x: number; y: number }
  | { t: 'stop' }
  | { t: 'play'; name: string }
  | { t: 'emotion'; name: string }
  | { t: 'volume'; value: number };

export interface User {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
}

export interface RobotMember {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  role: Role;
  joinedAt: string;
  lastActiveAt: string | null;
}

export interface Invite {
  id: string;
  code: string;
  robotId: string;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
}

export type NotificationType =
  | 'robot_offline'
  | 'battery_low'
  | 'someone_connected'
  | 'invited'
  | 'access_removed'
  | 'firmware_update';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  robotId?: string;
  createdAt: string;
  read: boolean;
}

export interface Telemetry {
  batteryPercent: number;
  wifiSignal: 0 | 1 | 2 | 3 | 4;
  latencyMs: number;
  currentEmotion: string;
}
