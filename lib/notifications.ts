import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { eq, and, gt, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { occurrence, task } from '@/db/schema';
import type { Occurrence } from '@/db/schema';

// ─── Setup ───────────────────────────────────────────────────────────────────

/**
 * Configure notification handler, interactive action categories, and Android notification channel.
 */
export async function setupNotifications(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch (e) {
          // ignore
        }
      }
    }
    return;
  }

  // Set handler for when notification is received while app is foregrounded
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // Register interactive notification action category
  try {
    await Notifications.setNotificationCategoryAsync('task-start', [
      {
        identifier: 'START_NOW',
        buttonTitle: 'Start Now',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: 'PAUSE',
        buttonTitle: 'Pause',
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: 'SKIP',
        buttonTitle: 'Skip',
        options: {
          opensAppToForeground: false,
          isDestructive: true,
        },
      },
    ]);
  } catch (err) {
    console.warn('Failed to set notification category:', err);
  }

  // Create Android notification channel with MAX importance for heads-up alert / alarms
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('cadence-tasks', {
      name: 'Task Starting Alarms',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6C5CE7',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      showBadge: true,
    });
  }
}

/**
 * Request notification permissions at runtime (required on Android 13+ and Web).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return true;
      try {
        const perm = await Notification.requestPermission();
        return perm === 'granted';
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  try {
    const existingPerms = await Notifications.getPermissionsAsync();
    if (existingPerms.granted) return true;

    const newPerms = await Notifications.requestPermissionsAsync();
    return newPerms.granted;
  } catch (e) {
    return false;
  }
}

/**
 * Display an immediate system alert / heads-up notification over other apps / tabs.
 */
export function showSystemNotification(title: string, body: string, data?: Record<string, any>): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
      } catch (e) {
        console.warn('Web notification failed:', e);
      }
    }
  } else {
    Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        categoryIdentifier: 'task-start',
        data: data ?? {},
        ...(Platform.OS === 'android' && { channelId: 'cadence-tasks' }),
      },
      trigger: null, // immediate
    }).catch((err) => console.warn('Native notification failed:', err));
  }
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

/**
 * Schedule a local notification for a single occurrence at its exact scheduled start timestamp.
 * Returns the notification identifier.
 */
export async function scheduleOccurrenceNotification(
  occ: Occurrence,
  taskTitle: string,
  category?: string | null,
  priority?: string | null,
  durationMinutes?: number | null
): Promise<string | null> {
  const now = Date.now();

  // Don't schedule notifications for past occurrences
  if (occ.scheduledStart <= now) return null;

  try {
    const prioLabel = priority ? `${priority.charAt(0).toUpperCase() + priority.slice(1)} Priority` : 'Medium Priority';
    const catText = category ? `${category} • ` : '';
    const durText = durationMinutes ? `${durationMinutes} minutes` : '30 minutes';

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 TASK STARTING',
        subtitle: 'Task starts now.',
        body: `${taskTitle}\n${catText}${prioLabel}\n${durText} • Task starts now.`,
        sound: 'default',
        categoryIdentifier: 'task-start',
        data: {
          occurrenceId: occ.id,
          taskId: occ.taskId,
          scheduledStart: occ.scheduledStart,
        },
        ...(Platform.OS === 'android' && { channelId: 'cadence-tasks' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(occ.scheduledStart),
      },
    });

    return identifier;
  } catch (error) {
    console.warn('Failed to schedule system notification:', error);
    return null;
  }
}

/**
 * Cancel a previously scheduled notification by its identifier.
 */
export async function cancelNotification(notificationId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.warn('Failed to cancel notification:', error);
  }
}

/**
 * Schedule a background task completion notification for when the active timer reaches zero.
 */
export async function scheduleCompletionNotification(
  occId: string,
  taskId: string,
  taskTitle: string,
  plannedMinutes: number,
  endTimeMs: number
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (endTimeMs <= Date.now()) return null;

  try {
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 TASK COMPLETED ✓',
        body: `${taskTitle}\n${plannedMinutes} minutes completed.`,
        sound: 'default',
        categoryIdentifier: 'task-completed',
        data: {
          occurrenceId: occId,
          taskId: taskId,
          type: 'completion',
        },
        ...(Platform.OS === 'android' && { channelId: 'cadence-tasks' }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(endTimeMs),
      },
    });

    return identifier;
  } catch (error) {
    console.warn('Failed to schedule completion notification:', error);
    return null;
  }
}

// ─── Task-level operations ───────────────────────────────────────────────────

/**
 * Cancel all scheduled notifications for a task's future occurrences,
 * then reschedule them with the OS. Used after task edit.
 */
export async function rescheduleForTask(taskId: string): Promise<void> {
  const now = Date.now();

  // Get all future occurrences for this task
  const futureOccurrences = await db
    .select()
    .from(occurrence)
    .where(and(eq(occurrence.taskId, taskId), gt(occurrence.scheduledStart, now)));

  // Get the task details
  const [taskData] = await db
    .select()
    .from(task)
    .where(eq(task.id, taskId));

  if (!taskData) return;

  // Cancel existing notifications
  for (const occ of futureOccurrences) {
    if (occ.notificationId) {
      await cancelNotification(occ.notificationId);
    }
  }

  // Schedule new notifications with OS
  for (const occ of futureOccurrences) {
    const notifId = await scheduleOccurrenceNotification(
      occ,
      taskData.title,
      taskData.category,
      taskData.priority,
      taskData.plannedMinutes
    );

    // Update the occurrence with the new notification ID in SQLite
    await db
      .update(occurrence)
      .set({ notificationId: notifId })
      .where(eq(occurrence.id, occ.id));
  }
}

/**
 * Cancel all notifications for a task (used before deletion).
 */
export async function cancelAllForTask(taskId: string): Promise<void> {
  const occurrences = await db
    .select()
    .from(occurrence)
    .where(
      and(eq(occurrence.taskId, taskId), isNotNull(occurrence.notificationId))
    );

  for (const occ of occurrences) {
    if (occ.notificationId) {
      await cancelNotification(occ.notificationId);
    }
  }
}

// ─── Notification Resync (safety net) ────────────────────────────────────────

/**
 * Resync notifications on every app foreground.
 * Diffs OS-scheduled notifications against DB occurrences:
 * - Reschedules anything missing from OS
 * - Cancels any orphans in OS not backed by a DB occurrence
 */
export async function resyncNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  const now = Date.now();

  try {
    // 1. Get all notifications the OS currently has scheduled
    const osScheduled = await Notifications.getAllScheduledNotificationsAsync();
    const osIds = new Set(osScheduled.map((n) => n.identifier));

    // 2. Get all future occurrences that should have notifications
    const futureOccurrences = await db
      .select({
        occurrence: occurrence,
        task: task,
      })
      .from(occurrence)
      .innerJoin(task, eq(task.id, occurrence.taskId))
      .where(gt(occurrence.scheduledStart, now));

    const dbNotifIds = new Set<string>();

    // 3. Check each DB occurrence — reschedule if missing from OS
    for (const row of futureOccurrences) {
      const occ = row.occurrence;
      const t = row.task;

      if (occ.notificationId) {
        dbNotifIds.add(occ.notificationId);
      }

      // If the occurrence has no notification, or the notification is missing from OS
      if (!occ.notificationId || !osIds.has(occ.notificationId)) {
        if (occ.notificationId && osIds.has(occ.notificationId)) {
          await cancelNotification(occ.notificationId);
        }

        // Schedule a new notification with OS
        const newNotifId = await scheduleOccurrenceNotification(
          occ,
          t.title,
          t.category,
          t.priority,
          t.plannedMinutes
        );

        // Update DB with new notification ID
        if (newNotifId) {
          await db
            .update(occurrence)
            .set({ notificationId: newNotifId })
            .where(eq(occurrence.id, occ.id));
        }
      }
    }

    // 4. Cancel orphan notifications (in OS but not in DB)
    for (const osNotif of osScheduled) {
      if (!dbNotifIds.has(osNotif.identifier)) {
        const data = osNotif.content?.data as
          | { occurrenceId?: string }
          | undefined;
        if (data?.occurrenceId) {
          await cancelNotification(osNotif.identifier);
        }
      }
    }
  } catch (error) {
    console.warn('Notification resync failed:', error);
  }
}

/**
 * Schedule notifications for all future occurrences that don't have one yet.
 * Used after initial occurrence generation.
 */
export async function scheduleAllPendingNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  const now = Date.now();

  const pendingOccurrences = await db
    .select({
      occurrence: occurrence,
      task: task,
    })
    .from(occurrence)
    .innerJoin(task, eq(task.id, occurrence.taskId))
    .where(gt(occurrence.scheduledStart, now));

  for (const row of pendingOccurrences) {
    const occ = row.occurrence;
    const t = row.task;

    // Skip if already has a valid notification
    if (occ.notificationId) continue;

    const notifId = await scheduleOccurrenceNotification(
      occ,
      t.title,
      t.category,
      t.priority,
      t.plannedMinutes
    );

    if (notifId) {
      await db
        .update(occurrence)
        .set({ notificationId: notifId })
        .where(eq(occurrence.id, occ.id));
    }
  }
}
