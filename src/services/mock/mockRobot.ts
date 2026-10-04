/**
 * Mock Robot Service
 * Seed data per plan section 8:
 * - Robot A: online, 82%, owner
 * - Robot B: offline, last seen 2h ago, owner
 * - Robot C: online, 12% low battery, shared by Anna
 * Pairing: 123456 succeeds, 000000 fails expired, 111111 fails already paired
 * Invite: 654321 is valid
 */

import type { Robot, RobotMember, Invite } from '../../types';
import type { RobotService } from '../interfaces';

const MOCK_DELAY = 600;
const delay = (ms: number = MOCK_DELAY) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const seedRobots: Robot[] = [
  {
    id: 'robot-a',
    name: 'LUMI',
    color: 'violet',
    room: 'Living room',
    role: 'owner',
    status: 'online',
    batteryPercent: 82,
    wifiSignal: 3,
    firmwareVersion: '1.0.0',
    lastSeenAt: new Date().toISOString(),
    ownerName: 'You',
    remoteAccessEnabled: true,
    capabilities: {
      emotions: ['happy', 'excited', 'love', 'surprised', 'sleepy', 'sad'],
      gestures: ['wave', 'dance'],
    },
  },
  {
    id: 'robot-b',
    name: 'LUMI Office',
    color: 'teal',
    room: 'Office',
    role: 'owner',
    status: 'offline',
    batteryPercent: 45,
    wifiSignal: null,
    firmwareVersion: '1.0.0',
    lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    ownerName: 'You',
    remoteAccessEnabled: true,
    capabilities: {
      emotions: ['happy', 'excited', 'love', 'surprised', 'sleepy', 'sad'],
      gestures: ['wave', 'dance'],
    },
  },
  {
    id: 'robot-c',
    name: 'LUMI Kitchen',
    color: 'coral',
    role: 'controller',
    status: 'online',
    batteryPercent: 12,
    wifiSignal: 2,
    firmwareVersion: '1.0.0',
    lastSeenAt: new Date().toISOString(),
    ownerName: 'Anna',
    remoteAccessEnabled: true,
    capabilities: {
      emotions: ['happy', 'excited', 'love', 'surprised', 'sleepy', 'sad'],
      gestures: ['wave', 'dance'],
    },
  },
];

let robots = [...seedRobots];

const seedMembers: RobotMember[] = [
  {
    userId: 'user-1',
    fullName: 'Ritik Mandal',
    email: 'ritik@test.com',
    role: 'owner',
    joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastActiveAt: new Date().toISOString(),
  },
  {
    userId: 'user-2',
    fullName: 'Anna Sharma',
    email: 'anna@test.com',
    role: 'controller',
    joinedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
];

const seedInvites: Invite[] = [
  {
    id: 'invite-1',
    code: '654321',
    robotId: 'robot-a',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    revoked: false,
  },
];

export const mockRobotService: RobotService = {
  async listRobots(): Promise<Robot[]> {
    await delay();
    return [...robots];
  },

  async getRobot(id: string): Promise<Robot> {
    await delay();
    const robot = robots.find((r) => r.id === id);
    if (!robot) throw new Error('Robot not found');
    return { ...robot };
  },

  async pairRobot(code: string): Promise<Robot> {
    await delay(2000); // Longer for pairing

    if (code === '000000') {
      throw new Error('This code has expired. Restart pairing on LUMI.');
    }
    if (code === '111111') {
      throw new Error('This LUMI is already paired to another account.');
    }
    if (code !== '123456') {
      throw new Error("That code isn't right. Check LUMI's screen.");
    }

    const newRobot: Robot = {
      id: 'robot-' + Date.now(),
      name: 'LUMI',
      color: 'violet',
      role: 'owner',
      status: 'online',
      batteryPercent: 100,
      wifiSignal: 4,
      firmwareVersion: '1.0.0',
      lastSeenAt: new Date().toISOString(),
      ownerName: 'You',
      remoteAccessEnabled: true,
      capabilities: {
        emotions: ['happy', 'excited', 'love', 'surprised', 'sleepy', 'sad'],
        gestures: ['wave', 'dance'],
      },
    };

    return newRobot;
  },

  async nameRobot(id: string, name: string, color: string, room?: string): Promise<Robot> {
    await delay();
    // Find or create the robot
    let robot = robots.find((r) => r.id === id);
    if (robot) {
      robot.name = name;
      robot.color = color;
      robot.room = room;
      return { ...robot };
    }
    // Newly paired robot
    const newRobot: Robot = {
      id,
      name,
      color,
      room,
      role: 'owner',
      status: 'online',
      batteryPercent: 100,
      wifiSignal: 4,
      firmwareVersion: '1.0.0',
      lastSeenAt: new Date().toISOString(),
      ownerName: 'You',
      remoteAccessEnabled: true,
      capabilities: {
        emotions: ['happy', 'excited', 'love', 'surprised', 'sleepy', 'sad'],
        gestures: ['wave', 'dance'],
      },
    };
    robots.push(newRobot);
    return newRobot;
  },

  async removeRobot(id: string): Promise<void> {
    await delay();
    robots = robots.filter((r) => r.id !== id);
  },

  async updateRobotSettings(id: string, settings: Partial<Robot>): Promise<Robot> {
    await delay();
    const robot = robots.find((r) => r.id === id);
    if (!robot) throw new Error('Robot not found');
    Object.assign(robot, settings);
    return { ...robot };
  },

  async getMembers(robotId: string): Promise<RobotMember[]> {
    await delay();
    return [...seedMembers];
  },

  async createInvite(robotId: string, expiresIn: '24h' | '7d' | 'never'): Promise<Invite> {
    await delay();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const invite: Invite = {
      id: 'invite-' + Date.now(),
      code,
      robotId,
      createdAt: new Date().toISOString(),
      expiresAt:
        expiresIn === 'never'
          ? null
          : new Date(
              Date.now() + (expiresIn === '24h' ? 24 : 7 * 24) * 60 * 60 * 1000,
            ).toISOString(),
      revoked: false,
    };
    seedInvites.push(invite);
    return invite;
  },

  async listInvites(robotId: string): Promise<Invite[]> {
    await delay();
    return seedInvites.filter((i) => i.robotId === robotId && !i.revoked);
  },

  async revokeInvite(inviteId: string): Promise<void> {
    await delay();
    const invite = seedInvites.find((i) => i.id === inviteId);
    if (invite) invite.revoked = true;
  },

  async acceptInvite(code: string): Promise<Robot> {
    await delay();
    if (code !== '654321') {
      throw new Error("This invite code isn't valid.");
    }
    // Return the robot from the invite
    return { ...seedRobots[0], role: 'controller', ownerName: 'Anna' };
  },

  async removeMember(robotId: string, userId: string): Promise<void> {
    await delay();
  },

  async leaveRobot(robotId: string): Promise<void> {
    await delay();
    robots = robots.filter((r) => r.id !== robotId);
  },
};
