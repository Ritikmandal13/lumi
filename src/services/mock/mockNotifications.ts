/**
 * Mock Notification Service
 * Seed list of 6 notifications of mixed types per plan section 8.
 */

import type { AppNotification } from '../../types';
import type { NotificationService } from '../interfaces';

const MOCK_DELAY = 400;
const delay = (ms: number = MOCK_DELAY) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const seedNotifications: AppNotification[] = [
  {
    id: 'notif-1',
    type: 'someone_connected',
    title: 'Anna connected',
    body: 'Anna connected to LUMI Kitchen',
    robotId: 'robot-c',
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: 'notif-2',
    type: 'battery_low',
    title: 'Battery low',
    body: 'LUMI Kitchen battery is at 12%',
    robotId: 'robot-c',
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    read: false,
  },
  {
    id: 'notif-3',
    type: 'robot_offline',
    title: 'LUMI Office went offline',
    body: 'LUMI Office has been offline for 10 minutes',
    robotId: 'robot-b',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
  {
    id: 'notif-4',
    type: 'invited',
    title: 'New invitation',
    body: 'Anna invited you to control LUMI Kitchen',
    robotId: 'robot-c',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
  {
    id: 'notif-5',
    type: 'firmware_update',
    title: 'Update available',
    body: 'Firmware update available for LUMI',
    robotId: 'robot-a',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
  {
    id: 'notif-6',
    type: 'access_removed',
    title: 'Access removed',
    body: 'Your access to LUMI Lab was removed',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    read: true,
  },
];

let notifications = [...seedNotifications];

export const mockNotificationService: NotificationService = {
  async listNotifications(): Promise<AppNotification[]> {
    await delay();
    return [...notifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },

  async markAsRead(id: string): Promise<void> {
    await delay(200);
    const notif = notifications.find((n) => n.id === id);
    if (notif) notif.read = true;
  },

  async markAllAsRead(): Promise<void> {
    await delay(200);
    notifications.forEach((n) => (n.read = true));
  },

  async deleteNotification(id: string): Promise<void> {
    await delay(200);
    notifications = notifications.filter((n) => n.id !== id);
  },
};
