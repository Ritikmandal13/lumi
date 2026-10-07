/**
 * Supabase Robot Service
 * Real cloud database and Edge Function integration for LUMI robots.
 */

import { supabase } from '../../lib/supabase';
import type { Robot, RobotMember, Invite, Role, RobotStatus } from '../../types';
import type { RobotService } from '../interfaces';

function mapDbRobotToRobot(
  dbRobot: any,
  currentUserId: string,
  ownerName: string = 'You',
  roleOverride?: Role
): Robot {
  const isOwner = dbRobot.owner_id === currentUserId;
  const role: Role = roleOverride || (isOwner ? 'owner' : 'controller');

  return {
    id: dbRobot.id,
    name: dbRobot.name || 'LUMI',
    color: dbRobot.color || 'violet',
    room: dbRobot.room || undefined,
    role,
    status: (dbRobot.status as RobotStatus) || 'offline',
    batteryPercent: dbRobot.battery_percent ?? null,
    wifiSignal: dbRobot.wifi_signal ?? null,
    firmwareVersion: dbRobot.firmware_version || '1.0.0',
    lastSeenAt: dbRobot.last_seen_at || dbRobot.created_at || new Date().toISOString(),
    ownerName: isOwner ? 'You' : ownerName,
    remoteAccessEnabled: dbRobot.remote_access_enabled ?? true,
    localIp: dbRobot.local_ip ?? null,
    capabilities: dbRobot.capabilities || {
      emotions: ['happy', 'excited', 'love', 'surprised', 'sleepy', 'sad'],
      gestures: ['wave', 'dance'],
    },
  };
}

export const supabaseRobotService: RobotService = {
  async listRobots(): Promise<Robot[]> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return [];

    const { data: dbRobots, error: robotsError } = await supabase
      .from('robots')
      .select('*')
      .order('created_at', { ascending: false });

    if (robotsError) {
      throw new Error(robotsError.message);
    }

    if (!dbRobots || dbRobots.length === 0) {
      return [];
    }

    // Fetch memberships to identify controller roles
    const { data: memberships } = await supabase
      .from('robot_members')
      .select('robot_id, role')
      .eq('user_id', user.id);

    const roleMap = new Map<string, Role>();
    memberships?.forEach((m) => {
      roleMap.set(m.robot_id, m.role as Role);
    });

    // Collect profile info for other robot owners
    const otherOwnerIds = Array.from(
      new Set(
        dbRobots
          .filter((r) => r.owner_id && r.owner_id !== user.id)
          .map((r) => r.owner_id)
      )
    );

    const ownerNameMap = new Map<string, string>();
    if (otherOwnerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', otherOwnerIds);

      profiles?.forEach((p) => {
        ownerNameMap.set(p.id, p.full_name || 'Owner');
      });
    }

    return dbRobots.map((r) => {
      const isOwner = r.owner_id === user.id;
      const role: Role = isOwner ? 'owner' : (roleMap.get(r.id) || 'controller');
      const ownerName = isOwner ? 'You' : (ownerNameMap.get(r.owner_id) || 'Owner');
      return mapDbRobotToRobot(r, user.id, ownerName, role);
    });
  },

  async getRobot(id: string): Promise<Robot> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Not authenticated');

    const { data: r, error } = await supabase
      .from('robots')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !r) {
      throw new Error('Robot not found');
    }

    const isOwner = r.owner_id === user.id;
    let role: Role = isOwner ? 'owner' : 'controller';
    let ownerName = 'You';

    if (!isOwner) {
      const { data: member } = await supabase
        .from('robot_members')
        .select('role')
        .eq('robot_id', id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (member?.role) {
        role = member.role as Role;
      }

      if (r.owner_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', r.owner_id)
          .maybeSingle();
        if (profile?.full_name) {
          ownerName = profile.full_name;
        }
      }
    }

    return mapDbRobotToRobot(r, user.id, ownerName, role);
  },

  async pairRobot(code: string): Promise<Robot> {
    const normalizedCode = code.trim();

    const { data, error } = await supabase.functions.invoke('claim-robot', {
      body: { pairing_code: normalizedCode },
    });

    if (error) {
      let errorMessage = error.message || '';
      try {
        if ('context' in error && (error as any).context && typeof (error as any).context.json === 'function') {
          const parsed = await (error as any).context.json();
          if (parsed?.error) {
            errorMessage = parsed.error;
          }
        }
      } catch {
        // Fallback to error message
      }

      const lower = errorMessage.toLowerCase();
      if (lower.includes('expired')) {
        throw new Error('This code has expired. Restart pairing on LUMI.');
      }
      if (lower.includes('already') || lower.includes('claimed')) {
        throw new Error('This LUMI is already paired to another account.');
      }
      if (lower.includes('invalid') || lower.includes('not found')) {
        throw new Error("That code isn't right. Check LUMI's screen.");
      }
      throw new Error(errorMessage || 'Failed to pair robot. Please try again.');
    }

    const robotId = data?.robot?.id;
    if (!robotId) {
      throw new Error('Pairing succeeded but robot details were missing.');
    }

    return await this.getRobot(robotId);
  },

  async nameRobot(id: string, name: string, color: string, room?: string): Promise<Robot> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('robots')
      .update({
        name: name.trim(),
        color,
        room: room?.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return mapDbRobotToRobot(data, user.id, 'You', 'owner');
  },

  async removeRobot(id: string): Promise<void> {
    const { error } = await supabase.from('robots').delete().eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
  },

  async updateRobotSettings(id: string, settings: Partial<Robot>): Promise<Robot> {
    const updates: Record<string, any> = {};
    if (settings.name !== undefined) updates.name = settings.name;
    if (settings.color !== undefined) updates.color = settings.color;
    if (settings.room !== undefined) updates.room = settings.room;
    if (settings.remoteAccessEnabled !== undefined) {
      updates.remote_access_enabled = settings.remoteAccessEnabled;
    }
    if (settings.capabilities !== undefined) {
      updates.capabilities = settings.capabilities;
    }

    const { error } = await supabase.from('robots').update(updates).eq('id', id);

    if (error) {
      throw new Error(error.message);
    }

    return await this.getRobot(id);
  },

  async getMembers(robotId: string): Promise<RobotMember[]> {
    const { data: members, error } = await supabase
      .from('robot_members')
      .select('user_id, role, joined_at, last_active_at')
      .eq('robot_id', robotId)
      .order('joined_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    if (!members || members.length === 0) {
      return [];
    }

    const userIds = members.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .in('id', userIds);

    const profileMap = new Map<string, { full_name?: string; email?: string; avatar_url?: string }>();
    profiles?.forEach((p) => profileMap.set(p.id, p));

    return members.map((m) => {
      const prof = profileMap.get(m.user_id);
      return {
        userId: m.user_id,
        fullName: prof?.full_name || 'Member',
        email: prof?.email || '',
        avatarUrl: prof?.avatar_url || undefined,
        role: m.role as Role,
        joinedAt: m.joined_at,
        lastActiveAt: m.last_active_at,
      };
    });
  },

  async createInvite(robotId: string, expiresIn: '24h' | '7d' | 'never'): Promise<Invite> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Not authenticated');

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt =
      expiresIn === 'never'
        ? null
        : new Date(
            Date.now() + (expiresIn === '24h' ? 24 : 7 * 24) * 60 * 60 * 1000
          ).toISOString();

    const { data, error } = await supabase
      .from('robot_invites')
      .insert({
        code,
        robot_id: robotId,
        created_by: user.id,
        expires_at: expiresAt,
        revoked: false,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return {
      id: data.id,
      code: data.code,
      robotId: data.robot_id,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      revoked: data.revoked,
    };
  },

  async listInvites(robotId: string): Promise<Invite[]> {
    const { data, error } = await supabase
      .from('robot_invites')
      .select('*')
      .eq('robot_id', robotId)
      .eq('revoked', false)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const now = Date.now();
    return (data || [])
      .filter((inv) => !inv.expires_at || new Date(inv.expires_at).getTime() > now)
      .map((inv) => ({
        id: inv.id,
        code: inv.code,
        robotId: inv.robot_id,
        createdAt: inv.created_at,
        expiresAt: inv.expires_at,
        revoked: inv.revoked,
      }));
  },

  async revokeInvite(inviteId: string): Promise<void> {
    const { error } = await supabase
      .from('robot_invites')
      .update({ revoked: true })
      .eq('id', inviteId);

    if (error) {
      throw new Error(error.message);
    }
  },

  async acceptInvite(code: string): Promise<Robot> {
    const { data, error } = await supabase.rpc('accept_robot_invite', {
      invite_code: code.trim(),
    });

    if (error) {
      throw new Error(error.message || "This invite code isn't valid.");
    }

    return await this.getRobot(data.id);
  },

  async removeMember(robotId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('robot_members')
      .delete()
      .eq('robot_id', robotId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  },

  async leaveRobot(robotId: string): Promise<void> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('robot_members')
      .delete()
      .eq('robot_id', robotId)
      .eq('user_id', user.id);

    if (error) {
      throw new Error(error.message);
    }
  },
};
