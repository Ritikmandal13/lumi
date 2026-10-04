/**
 * Service interfaces for LUMI app
 * Mock implementations are used when EXPO_PUBLIC_USE_MOCKS=true
 * Real implementations plug in behind the same interfaces
 */

import type { User, Robot, Session, RobotMember, Invite, AppNotification, ConnectionState, ControlMessage, Telemetry } from '../types';

// ─── Auth ────────────────────────────────────────────────────────
export interface AuthService {
  signUp(fullName: string, email: string, password: string): Promise<User>;
  logIn(email: string, password: string): Promise<User>;
  logOut(): Promise<void>;
  forgotPassword(email: string): Promise<void>;
  verifyEmail(code: string, email?: string): Promise<void>;
  resendVerification(email?: string): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  signInWithGoogle(): Promise<User>;
  deleteAccount(password: string): Promise<void>;
}

// ─── Robots ──────────────────────────────────────────────────────
export interface RobotService {
  listRobots(): Promise<Robot[]>;
  getRobot(id: string): Promise<Robot>;
  pairRobot(code: string): Promise<Robot>;
  nameRobot(id: string, name: string, color: string, room?: string): Promise<Robot>;
  removeRobot(id: string): Promise<void>;
  updateRobotSettings(id: string, settings: Partial<Robot>): Promise<Robot>;
  // Sharing
  getMembers(robotId: string): Promise<RobotMember[]>;
  createInvite(robotId: string, expiresIn: '24h' | '7d' | 'never'): Promise<Invite>;
  listInvites(robotId: string): Promise<Invite[]>;
  revokeInvite(inviteId: string): Promise<void>;
  acceptInvite(code: string): Promise<Robot>;
  removeMember(robotId: string, userId: string): Promise<void>;
  leaveRobot(robotId: string): Promise<void>;
}

// ─── Live ────────────────────────────────────────────────────────
export interface LiveSessionCallbacks {
  onConnectionStateChange: (state: ConnectionState) => void;
  onTelemetry: (telemetry: Telemetry) => void;
  onError: (error: string) => void;
}

export interface LiveService {
  connect(robotId: string, callbacks: LiveSessionCallbacks): Promise<void>;
  disconnect(): Promise<void>;
  getConnectionState(): ConnectionState;
}

// ─── Control ─────────────────────────────────────────────────────
export interface ControlChannel {
  send(message: ControlMessage): void;
  startDriving(x: number, y: number): void;
  stopDriving(): void;
  sendEmotion(name: string): void;
  sendGesture(name: string): void;
  setVolume(value: number): void;
}

// ─── Sessions ────────────────────────────────────────────────────
export interface SessionService {
  listSessions(filters?: { robotId?: string; userId?: string }): Promise<Session[]>;
  getSession(id: string): Promise<Session>;
  rateSession(id: string, rating: 'great' | 'ok' | 'problem'): Promise<void>;
  createSession(robotId: string, startedAt: string, endedAt: string): Promise<Session>;
}

// ─── Notifications ───────────────────────────────────────────────
export interface NotificationService {
  listNotifications(): Promise<AppNotification[]>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(): Promise<void>;
  deleteNotification(id: string): Promise<void>;
}
