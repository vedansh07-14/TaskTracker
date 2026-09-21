import { useEffect, useState } from 'react';
import { generateOccurrences } from '@/lib/occurrences';
import { sweepMissedOccurrences } from '@/lib/missed';
import {
  setupNotifications,
  requestNotificationPermission,
  scheduleAllPendingNotifications,
  resyncNotifications,
} from '@/lib/notifications';
import { useAppStore } from '@/store/appStore';
import { useTaskExecutionStore } from '@/store/taskExecutionStore';

/**
 * Bootstrap hook: runs all startup tasks in sequence.
 * 1. Setup notifications (handler + channel)
 * 2. Request notification permission
 * 3. Generate occurrences for next 14 days
 * 4. Sweep missed occurrences
 * 5. Schedule pending notifications
 * 6. Resync notifications with OS
 * 7. Reconcile any active running tasks
 */
export function useBootstrap(migrationsReady: boolean): {
  isReady: boolean;
  error: string | null;
} {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setStoreReady = useAppStore((s) => s.setReady);
  const setBootstrapError = useAppStore((s) => s.setBootstrapError);

  useEffect(() => {
    if (!migrationsReady) return;

    let cancelled = false;

    async function bootstrap(): Promise<void> {
      try {
        // 1. Setup notification handler and Android channel
        await setupNotifications();

        // 2. Request permission (non-blocking — we proceed even if denied)
        await requestNotificationPermission();

        // 3. Generate occurrences
        await generateOccurrences();

        // 4. Sweep missed tasks
        await sweepMissedOccurrences();

        // 5. Schedule notifications for any without one
        await scheduleAllPendingNotifications();

        // 6. Resync (diff OS vs DB)
        await resyncNotifications();

        // 7. Reconcile running task state
        await useTaskExecutionStore.getState().reconcileState();

        if (!cancelled) {
          setIsReady(true);
          setStoreReady(true);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Bootstrap failed';
        console.error('Bootstrap error:', err);
        if (!cancelled) {
          setError(message);
          setBootstrapError(message);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [migrationsReady]);

  return { isReady, error };
}
