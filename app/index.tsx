import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/features/auth/useAuthStore';

export default function Index() {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/robots" />;
  }

  return <Redirect href="/(auth)/onboarding" />;
}
