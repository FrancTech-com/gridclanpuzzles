// app/(auth)/_layout.tsx
import { Stack } from 'expo-router';
import { useColors } from '@theme/theme';
export default function AuthLayout() {
  const Colors = useColors();
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: Colors.bg },
      animation: 'fade',
    }} />
  );
}
