import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useDatabaseMigrations } from '@/hooks/useDatabaseMigrations';
import { useBootstrap } from '@/hooks/useBootstrap';
import { useAppForeground } from '@/hooks/useAppForeground';
import { useNotificationObserver } from '@/hooks/useNotificationObserver';
import { Colors, FontSize, FontWeight } from '@/constants/theme';

export default function RootLayout() {
  const { success: migrationsReady, error: migrationsError } = useDatabaseMigrations();

  const { isReady, error: bootstrapError } = useBootstrap(
    migrationsReady ?? false
  );

  // Register foreground listener for resync
  useAppForeground();

  // Register notification received and response listeners
  useNotificationObserver();

  // Show loading splash
  if (!isReady) {
    return (
      <View style={styles.splash}>
        <StatusBar style="light" />
        <Text style={styles.splashTitle}>Cadence</Text>
        <Text style={styles.splashSubtitle}>Your rhythm, your rules</Text>
        {(migrationsError || bootstrapError) ? (
          <Text style={styles.errorText}>
            {migrationsError?.message ?? bootstrapError}
          </Text>
        ) : (
          <ActivityIndicator
            size="large"
            color={Colors.accentPrimary}
            style={styles.loader}
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.rootContainer}>
      <StatusBar style="light" />
      <View style={styles.appContainer}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="task/[id]"
            options={{
              presentation: 'modal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#050508',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appContainer: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 500 : undefined,
    backgroundColor: Colors.background,
    overflow: 'hidden',
  },
  splash: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashTitle: {
    fontSize: FontSize.display,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -1,
  },
  splashSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    marginTop: 8,
  },
  loader: {
    marginTop: 32,
  },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.missed,
    marginTop: 24,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
});
