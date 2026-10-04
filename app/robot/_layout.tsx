import { Stack } from 'expo-router';

export default function RobotLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="[id]/index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]/drive" options={{ headerShown: false }} />
      <Stack.Screen name="[id]/end" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="[id]/members" options={{ headerShown: false }} />
      <Stack.Screen name="[id]/settings" options={{ headerShown: false }} />
    </Stack>
  );
}
