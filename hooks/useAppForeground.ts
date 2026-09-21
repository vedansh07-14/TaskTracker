import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { generateOccurrences } from '@/lib/occurrences';
import { sweepMissedOccurrences } from '@/lib/missed';
import { resyncNotifications } from '@/lib/notifications';
import { useTaskExecutionStore } from '@/store/taskExecutionStore';

/**
 * Listen for app coming to the foreground and re-run
 * occurrence generation, missed sweep, notification resync,
 * and active task timer reconciliation.
 */
export function useAppForeground(): void {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      async (nextAppState: AppStateStatus) => {
        // Transition from background/inactive → active
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          try {
            await generateOccurrences();
            await sweepMissedOccurrences();
            await resyncNotifications();
            await useTaskExecutionStore.getState().reconcileState();
          } catch (error) {
            console.warn('Foreground resync failed:', error);
          }
        }

        appState.current = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);
}
