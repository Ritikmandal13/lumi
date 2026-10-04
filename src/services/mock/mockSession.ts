/**
 * Mock Session Service
 * Activity history and session rating
 */

import type { Session } from '../../types';
import type { SessionService } from '../interfaces';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const initialSessions: Session[] = [
  {
    id: 'sess-1',
    robotId: 'robot-1',
    userId: 'u1',
    startedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
    rating: 'great',
    robotName: 'Sparky',
    userName: 'Alex Rivers',
  },
  {
    id: 'sess-2',
    robotId: 'robot-2',
    userId: 'u2',
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 5 + 1000 * 60 * 18).toISOString(),
    rating: 'ok',
    robotName: 'Bolt',
    userName: 'Jordan Lee',
  },
  {
    id: 'sess-3',
    robotId: 'robot-1',
    userId: 'u1',
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 26 + 1000 * 60 * 8).toISOString(),
    rating: 'great',
    robotName: 'Sparky',
    userName: 'Alex Rivers',
  },
  {
    id: 'sess-4',
    robotId: 'robot-3',
    userId: 'u3',
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    endedAt: new Date(Date.now() - 1000 * 60 * 60 * 72 + 1000 * 60 * 22).toISOString(),
    rating: 'problem',
    robotName: 'Pip',
    userName: 'Taylor Kim',
  },
];

let sessions = [...initialSessions];

export const mockSessionService: SessionService = {
  async listSessions(filters?: { robotId?: string; userId?: string }): Promise<Session[]> {
    await delay(300);
    let result = [...sessions];
    if (filters?.robotId) {
      result = result.filter((s) => s.robotId === filters.robotId);
    }
    if (filters?.userId) {
      result = result.filter((s) => s.userId === filters.userId);
    }
    return result.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  },

  async getSession(id: string): Promise<Session> {
    await delay(150);
    const session = sessions.find((s) => s.id === id);
    if (!session) throw new Error('Session not found');
    return session;
  },

  async rateSession(id: string, rating: 'great' | 'ok' | 'problem'): Promise<void> {
    await delay(200);
    sessions = sessions.map((s) => (s.id === id ? { ...s, rating } : s));
  },

  async createSession(robotId: string, startedAt: string, endedAt: string): Promise<Session> {
    await delay(200);
    const newSession: Session = {
      id: 'sess-' + Date.now(),
      robotId,
      userId: 'user-mock',
      startedAt,
      endedAt,
      robotName: 'LUMI',
      userName: 'You',
    };
    sessions.unshift(newSession);
    return newSession;
  },
};
