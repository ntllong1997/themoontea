import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useSettingsStore } from '@/store/settingsStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const stripeKey = useSettingsStore((s) => s.stripePublishableKey);
  const stripeLocationId = useSettingsStore((s) => s.stripeLocationId);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StripeProvider
          publishableKey={stripeKey || 'pk_test_placeholder'}
          stripeAccountId={undefined}
        >
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
            <Stack.Screen name="item-editor" options={{ presentation: 'modal' }} />
            <Stack.Screen name="payment" options={{ presentation: 'modal' }} />
          </Stack>
          <StatusBar style="light" />
        </StripeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
