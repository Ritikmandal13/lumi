/**
 * Auth store — Zustand
 * Manages session, user, and auth loading state.
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { User } from '../../types';
import { authService } from '../../services';

const SESSION_KEY = 'lumi_user_session';

async function saveSession(user: User): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(user));
    }
  } catch {
    // Non-blocking fallback for storage
  }
}

async function getStoredSession(): Promise<User | null> {
  try {
    if (Platform.OS !== 'web') {
      const data = await SecureStore.getItemAsync(SESSION_KEY);
      return data ? (JSON.parse(data) as User) : null;
    }
  } catch {
    return null;
  }
  return null;
}

async function clearStoredSession(): Promise<void> {
  try {
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
  } catch {
    // Non-blocking fallback
  }
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsVerification: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  verifyEmail: (code: string, email?: string) => Promise<void>;
  resendVerification: (email?: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  needsVerification: false,
  error: null,

  initialize: async () => {
    try {
      set({ isLoading: true, error: null });

      // First check local encrypted storage for instant resume
      const storedUser = await getStoredSession();
      if (storedUser) {
        set({
          user: storedUser,
          isAuthenticated: true,
          isLoading: false,
        });
        return;
      }

      const user = await authService.getCurrentUser();
      if (user) {
        await saveSession(user);
      }
      set({
        user,
        isAuthenticated: !!user,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, user: null, isAuthenticated: false });
    }
  },

  signUp: async (fullName, email, password) => {
    try {
      set({ isLoading: true, error: null });
      const user = await authService.signUp(fullName, email, password);
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        await saveSession(currentUser);
        set({
          user: currentUser,
          isAuthenticated: true,
          isLoading: false,
          needsVerification: false,
        });
      } else {
        set({
          user,
          isLoading: false,
          needsVerification: true,
        });
      }
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  logIn: async (email, password) => {
    try {
      set({ isLoading: true, error: null });
      const user = await authService.logIn(email, password);
      await saveSession(user);
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        needsVerification: false,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  signInWithGoogle: async () => {
    try {
      set({ isLoading: true, error: null });
      const user = await authService.signInWithGoogle();
      await saveSession(user);
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        needsVerification: false,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  logOut: async () => {
    try {
      await authService.logOut();
      await clearStoredSession();
      set({ user: null, isAuthenticated: false, needsVerification: false });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  forgotPassword: async (email) => {
    try {
      set({ isLoading: true, error: null });
      await authService.forgotPassword(email);
      set({ isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  verifyEmail: async (code, email) => {
    try {
      set({ isLoading: true, error: null });
      const targetEmail = email || get().user?.email;
      await authService.verifyEmail(code, targetEmail);
      const currentUser = (await authService.getCurrentUser()) || get().user;
      if (currentUser) {
        await saveSession(currentUser);
      }
      set({
        user: currentUser,
        isAuthenticated: true,
        isLoading: false,
        needsVerification: false,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  resendVerification: async (email) => {
    try {
      const targetEmail = email || get().user?.email;
      await authService.resendVerification(targetEmail);
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteAccount: async (password) => {
    try {
      set({ isLoading: true, error: null });
      await authService.deleteAccount(password);
      await clearStoredSession();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
