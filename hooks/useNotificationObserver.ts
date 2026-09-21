import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { occurrence, task } from '@/db/schema';
import { useTaskExecutionStore } from '@/store/taskExecutionStore';
import { playTaskStartSiren } from '@/lib/audio';

/**
 * Hook that listens for incoming notifications and interactive user actions
 * (Start Now, Pause, Skip, or tapping the notification).
 */
export function useNotificationObserver(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    // 1. Handle notification received while app is in foreground
    const receivedSub = Notifications.addNotificationReceivedListener(async (notif) => {
      const data = notif.request.content.data as { occurrenceId?: string; taskId?: string } | undefined;
      const occId = data?.occurrenceId;
      if (!occId) return;

      const store = useTaskExecutionStore.getState();
      // If not already active in another task
      if (store.executionState === 'idle') {
        const [occ] = await db.select().from(occurrence).where(eq(occurrence.id, occId));
        if (!occ) return;
        const [t] = await db.select().from(task).where(eq(task.id, occ.taskId));
        if (!t) return;

        // Mark siren triggered
        await db.update(occurrence).set({ sirenTriggered: 1, status: 'starting' }).where(eq(occurrence.id, occId));

        if (t.soundEnabled === 1 && !store.isMuted) {
          playTaskStartSiren(false);
        }

        const totalSec = (t.plannedMinutes ?? 30) * 60;
        useTaskExecutionStore.setState({
          activeOccurrenceId: occ.id,
          activeOccurrence: { ...occ, status: 'starting', sirenTriggered: 1 },
          activeTask: t,
          executionState: 'starting',
          autoStartCountdown: 30,
          totalDurationSeconds: totalSec,
          remainingSeconds: totalSec,
          showStartingModal: true,
          dataVersion: store.dataVersion + 1,
        });
      }
    });

    // 2. Handle user interaction with notification (tapped action or notification body)
    const handleResponse = async (response: Notifications.NotificationResponse) => {
      const actionId = response.actionIdentifier;
      const data = response.notification.request.content.data as { occurrenceId?: string; taskId?: string } | undefined;
      const occId = data?.occurrenceId;
      if (!occId) return;

      const store = useTaskExecutionStore.getState();

      if (actionId === 'START_NOW') {
        // Direct start action
        await store.startTaskNow(occId);
      } else if (actionId === 'PAUSE') {
        // Pause action
        await db.update(occurrence).set({ status: 'paused' }).where(eq(occurrence.id, occId));
        store.incrementDataVersion();
      } else if (actionId === 'SKIP') {
        // Skip action
        await db.update(occurrence).set({ status: 'skipped', actualEndTime: Date.now() }).where(eq(occurrence.id, occId));
        store.incrementDataVersion();
      } else {
        // Default action: user tapped the notification body -> open starting view
        const [occ] = await db.select().from(occurrence).where(eq(occurrence.id, occId));
        if (!occ) return;
        const [t] = await db.select().from(task).where(eq(task.id, occ.taskId));
        if (!t) return;

        if (occ.status === 'running') {
          await store.openRunningView(occId);
        } else {
          const totalSec = (t.plannedMinutes ?? 30) * 60;
          useTaskExecutionStore.setState({
            activeOccurrenceId: occ.id,
            activeOccurrence: occ,
            activeTask: t,
            executionState: 'starting',
            autoStartCountdown: 30,
            totalDurationSeconds: totalSec,
            remainingSeconds: totalSec,
            showStartingModal: true,
            dataVersion: store.dataVersion + 1,
          });
        }
      }
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse);

    // 3. Handle cold-start: if app was launched by tapping a notification
    Notifications.getLastNotificationResponseAsync().then((lastResponse) => {
      if (lastResponse) {
        handleResponse(lastResponse);
      }
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);
}
