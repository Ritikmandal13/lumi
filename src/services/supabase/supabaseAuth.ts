/**
 * Supabase Auth Service
 * Real cloud authentication using Supabase Auth.
 */

import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import type { User } from '../../types';
import type { AuthService } from '../interfaces';

WebBrowser.maybeCompleteAuthSession();

let pendingEmail: string = '';

export const supabaseAuthService: AuthService = {
  async signUp(fullName: string, email: string, password: string): Promise<User> {
    pendingEmail = email.trim();
    const { data, error } = await supabase.auth.signUp({
      email: pendingEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
        },
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes('rate limit')) {
        throw new Error(
          'Email rate limit reached (Supabase limits test emails to 3/hour). You can sign in with your confirmed account or use Google.',
        );
      }
      throw new Error(error.message);
    }

    // Supabase returns identities: [] if the email already belongs to a user (e.g. Google auth)
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new Error(
        'An account with this email already exists. Please log in or continue with Google.',
      );
    }

    const authUser = data.user;
    return {
      id: authUser?.id || `user-${Date.now()}`,
      fullName:
        authUser?.user_metadata?.full_name ||
        fullName,
      email: authUser?.email || email,
    };
  },

  async logIn(email: string, password: string): Promise<User> {
    pendingEmail = email.trim();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: pendingEmail,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error('User not found');
    }

    return {
      id: data.user.id,
      fullName:
        data.user.user_metadata?.full_name ||
        data.user.email?.split('@')[0] ||
        'LUMI User',
      email: data.user.email || email,
    };
  },

  async logOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
  },

  async forgotPassword(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      throw new Error(error.message);
    }
  },

  async verifyEmail(code: string, email?: string): Promise<void> {
    const targetEmail = (email || pendingEmail).trim();
    if (!targetEmail) {
      throw new Error('No email found to verify. Please re-enter your email.');
    }

    // Try standard signup OTP verification
    const { error } = await supabase.auth.verifyOtp({
      email: targetEmail,
      token: code.trim(),
      type: 'signup',
    });

    if (error) {
      // Fallback for magiclink/email OTP type
      const fallback = await supabase.auth.verifyOtp({
        email: targetEmail,
        token: code.trim(),
        type: 'email',
      });

      if (fallback.error) {
        throw new Error(error.message || fallback.error.message);
      }
    }
  },

  async resendVerification(email?: string): Promise<void> {
    const targetEmail = (email || pendingEmail).trim();
    if (!targetEmail) {
      throw new Error('No pending email found to resend verification.');
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: targetEmail,
    });

    if (error) {
      throw new Error(error.message);
    }
  },

  async getCurrentUser(): Promise<User | null> {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user) {
      return null;
    }

    pendingEmail = session.user.email || '';
    return {
      id: session.user.id,
      fullName:
        session.user.user_metadata?.full_name ||
        session.user.email?.split('@')[0] ||
        'LUMI User',
      email: session.user.email || '',
    };
  },

  async signInWithGoogle(): Promise<User> {
    const redirectUrl = Linking.createURL('auth/callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data?.url) {
      throw new Error('No authorization URL returned from Supabase.');
    }

    let authUrl: string | null = null;

    // Listen for incoming deep links in case Android handles the intent before WebBrowser resolves
    const linkingSub = Linking.addEventListener('url', (event) => {
      if (
        event.url &&
        (event.url.includes('code=') ||
          event.url.includes('access_token=') ||
          event.url.includes('callback'))
      ) {
        authUrl = event.url;
      }
    });

    try {
      const authResult = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUrl,
        { showInRecents: true },
      );

      if (authResult.type === 'success' && authResult.url) {
        authUrl = authResult.url;
      }
    } catch {
      // openAuthSessionAsync might throw if dismissed by system on Android;
      // linkingSub will still capture the incoming redirect URL.
    } finally {
      linkingSub.remove();
    }

    if (!authUrl) {
      // Give deep link up to 1s if browser closed slightly before JS received intent
      for (let i = 0; i < 10 && !authUrl; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (authUrl) {
      // 1. Check for query code (PKCE flow)
      const parsed = Linking.parse(authUrl);
      const code =
        typeof parsed.queryParams?.code === 'string'
          ? parsed.queryParams.code
          : undefined;

      if (code) {
        const { data: exchangeData, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          throw new Error(exchangeError.message);
        }
        if (exchangeData.user) {
          const authUser = exchangeData.user;
          return {
            id: authUser.id,
            fullName:
              authUser.user_metadata?.full_name ||
              authUser.user_metadata?.name ||
              authUser.email?.split('@')[0] ||
              'LUMI User',
            email: authUser.email || '',
          };
        }
      }

      // 2. Check for hash fragments (#access_token=...&refresh_token=...)
      const hashIndex = authUrl.indexOf('#');
      if (hashIndex !== -1) {
        const hashParams = new URLSearchParams(authUrl.substring(hashIndex + 1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { data: sessionData, error: sessionErr } =
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

          if (sessionErr) {
            throw new Error(sessionErr.message);
          }

          if (sessionData.user) {
            const authUser = sessionData.user;
            return {
              id: authUser.id,
              fullName:
                authUser.user_metadata?.full_name ||
                authUser.user_metadata?.name ||
                authUser.email?.split('@')[0] ||
                'LUMI User',
              email: authUser.email || '',
            };
          }
        }
      }
    }

    // Fallback: check getSession()
    const { data: currentSession } = await supabase.auth.getSession();
    if (currentSession.session?.user) {
      const u = currentSession.session.user;
      return {
        id: u.id,
        fullName:
          u.user_metadata?.full_name ||
          u.user_metadata?.name ||
          u.email?.split('@')[0] ||
          'LUMI User',
        email: u.email || '',
      };
    }

    throw new Error('Failed to retrieve user after Google sign in.');
  },

  async deleteAccount(_password: string): Promise<void> {
    // Sign out local session
    await supabase.auth.signOut();
  },
};

