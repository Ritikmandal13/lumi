/**
 * Supabase Notification Service
 * Syncs user notifications with Supabase DB.
 */

import { supabase } from '../../lib/supabase';
import type { AppNotification, NotificationType } from '../../types';
import type { NotificationService } from '../interfaces';

export const supabaseNotificationService: NotificationService = {
  async listNotifications(): Promise<AppNotification[]> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return [];

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return (data || []).map((n) => ({
      id: n.id,
      type: n.type as NotificationType,
      title: n.title,
      body: n.body,
      robotId: n.robot_id || undefined,
      createdAt: n.created_at,
      read: !!n.read,
    }));
  },

  async markAsRead(id: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  async markAllAsRead(): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id);

    if (error) throw new Error(error.message);
  },

  async deleteNotification(id: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);
  },
};
