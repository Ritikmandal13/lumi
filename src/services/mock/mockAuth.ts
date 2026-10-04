/**
 * Mock Auth Service
 * Simulated delays (200-500ms).
 * Successful login, signup, reset, verification.
 * Preloaded test accounts and error trigger inputs.
 */

import type { User } from '../../types';
import type { AuthService } from '../interfaces';

const MOCK_DELAY = 300;
const VALID_PASSWORD = 'password123';
const VALID_CODE = '123456';

const delay = (ms: number = MOCK_DELAY) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

let currentUser: User | null = null;

export const mockAuthService: AuthService = {
  async signUp(fullName: string, email: string, password: string): Promise<User> {
    await delay();

    if (!email.includes('@')) {
      throw new Error('Invalid email format');
    }
    if (email === 'taken@test.com') {
      throw new Error('This email is already registered.');
    }
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const user: User = {
      id: 'user-' + Date.now(),
      fullName,
      email,
    };

    currentUser = user;
    return user;
  },

  async logIn(email: string, password: string): Promise<User> {
    await delay();

    if (!email.includes('@')) {
      throw new Error('Invalid email format');
    }

    if (password !== VALID_PASSWORD) {
      throw new Error('Incorrect email or password.');
    }

    const user: User = {
      id: 'user-1',
      fullName: 'Ritik Mandal',
      email,
    };

    currentUser = user;
    return user;
  },

  async logOut(): Promise<void> {
    await delay();
    currentUser = null;
  },

  async forgotPassword(email: string): Promise<void> {
    await delay();
    if (!email.includes('@')) {
      throw new Error('Invalid email format');
    }
    // Always succeeds in mock
  },

  async verifyEmail(code: string): Promise<void> {
    await delay();
    if (code !== VALID_CODE) {
      throw new Error("That code isn't right. Check and try again.");
    }
  },

  async resendVerification(): Promise<void> {
    await delay();
    // Always succeeds
  },

  async getCurrentUser(): Promise<User | null> {
    await delay(200);
    return currentUser;
  },

  async signInWithGoogle(): Promise<User> {
    await delay(400);
    const user: User = {
      id: 'google-user-1',
      fullName: 'Google User',
      email: 'user@gmail.com',
    };
    currentUser = user;
    return user;
  },

  async deleteAccount(password: string): Promise<void> {
    await delay();
    if (password !== VALID_PASSWORD) {
      throw new Error('Incorrect password');
    }
    currentUser = null;
  },
};
