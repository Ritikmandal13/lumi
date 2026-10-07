/**
 * Service provider
 * Always uses mocks for now (EXPO_PUBLIC_USE_MOCKS defaults to true).
 * Real implementations plug in here later.
 */

import {
  livekitLiveService,
  livekitControlChannel,
  subscribeToRobotVideoTrack,
  getRobotVideoTrack,
  setRobotMicrophone,
  setDirectRobotIp,
} from './livekit/livekitService';

import { supabaseAuthService } from './supabase/supabaseAuth';
import { supabaseRobotService } from './supabase/supabaseRobot';
import { supabaseSessionService } from './supabase/supabaseSession';
import { supabaseNotificationService } from './supabase/supabaseNotification';
import type {
  AuthService,
  RobotService,
  LiveService,
  ControlChannel,
  NotificationService,
  SessionService,
} from './interfaces';

// Real Supabase Services
export const authService: AuthService = supabaseAuthService;
export const robotService: RobotService = supabaseRobotService;
export const notificationService: NotificationService = supabaseNotificationService;
export const sessionService: SessionService = supabaseSessionService;

// Real LiveKit WebRTC Video/Audio & Robot Control
export const liveService: LiveService = livekitLiveService;
export const controlChannel: ControlChannel = livekitControlChannel;

export {
  subscribeToRobotVideoTrack,
  getRobotVideoTrack,
  setRobotMicrophone,
  setDirectRobotIp,
} from './livekit/livekitService';

export type {
  AuthService,
  RobotService,
  LiveService,
  ControlChannel,
  NotificationService,
  SessionService,
} from './interfaces';
