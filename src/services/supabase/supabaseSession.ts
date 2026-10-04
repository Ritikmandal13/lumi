/**
 * Supabase Session Service
 * Persists session activity and ratings to Supabase DB.
 */

import { supabase } from '../../lib/supabase';
import type { Session } from '../../types';
import type { SessionService } from '../interfaces';

export const supabaseSessionService: SessionService = {
  async listSessions(filters?: { robotId?: string; userId?: string }): Promise<Session[]> {
    let query = supabase
      .from('sessions')
      .select('*')
      .order('started_at', { ascending: false });

    if (filters?.robotId) {
      query = query.eq('robot_id', filters.robotId);
    }
    if (filters?.userId) {
      query = query.eq('user_id', filters.userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    if (!data || data.length === 0) return [];

    // Fetch robot names and user names for display
    const robotIds = Array.from(new Set(data.map((s) => s.robot_id).filter(Boolean)));
    const userIds = Array.from(new Set(data.map((s) => s.user_id).filter(Boolean)));

    const [robotsRes, profilesRes] = await Promise.all([
      robotIds.length > 0
        ? supabase.from('robots').select('id, name').in('id', robotIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase.from('profiles').select('id, full_name').in('id', userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const robotMap = new Map((robotsRes.data || []).map((r: any) => [r.id, r.name]));
    const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.full_name]));

    return data.map((s) => ({
      id: s.id,
      robotId: s.robot_id,
      userId: s.user_id,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      rating: s.rating as 'great' | 'ok' | 'problem' | undefined,
      robotName: robotMap.get(s.robot_id) || 'LUMI',
      userName: profileMap.get(s.user_id) || 'User',
    }));
  },

  async getSession(id: string): Promise<Session> {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw new Error('Session not found');

    const [robotRes, profileRes] = await Promise.all([
      data.robot_id
        ? supabase.from('robots').select('name').eq('id', data.robot_id).maybeSingle()
        : Promise.resolve({ data: null }),
      data.user_id
        ? supabase.from('profiles').select('full_name').eq('id', data.user_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    return {
      id: data.id,
      robotId: data.robot_id,
      userId: data.user_id,
      startedAt: data.started_at,
      endedAt: data.ended_at,
      rating: data.rating as 'great' | 'ok' | 'problem' | undefined,
      robotName: robotRes.data?.name || 'LUMI',
      userName: profileRes.data?.full_name || 'User',
    };
  },

  async rateSession(id: string, rating: 'great' | 'ok' | 'problem'): Promise<void> {
    const { error } = await supabase
      .from('sessions')
      .update({ rating })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  async createSession(robotId: string, startedAt: string, endedAt: string): Promise<Session> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        robot_id: robotId,
        user_id: user.id,
        started_at: startedAt,
        ended_at: endedAt,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return {
      id: data.id,
      robotId: data.robot_id,
      userId: data.user_id,
      startedAt: data.started_at,
      endedAt: data.ended_at,
    };
  },
};
