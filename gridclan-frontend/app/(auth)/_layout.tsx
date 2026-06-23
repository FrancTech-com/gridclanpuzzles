// app/(auth)/_layout.tsx
import { Stack } from 'expo-router';
import { Colors } from '@theme/index';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: Colors.bg },
      animation: 'fade',
    }} />
  );
}
