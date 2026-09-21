import { create } from 'zustand';
import { eq } from 'drizzle-orm';
import { format } from 'date-fns';
import { db } from '@/db/client';
import { occurrence, task, completionLog } from '@/db/schema';
import type { Occurrence, Task, OccurrenceStatus } from '@/db/schema';
import { generateUUID } from '@/lib/uuid';
import { playTaskStartSiren, playTaskCompletionChime } from '@/lib/audio';
import { showSystemNotification, scheduleCompletionNotification, cancelNotification } from '@/lib/notifications';

export interface TaskExecutionState {
  activeOccurrenceId: string | null;
  activeTask: Task | null;
  activeOccurrence: Occurrence | null;
  executionState: 'idle' | 'starting' | 'running' | 'paused' | 'completed';
  autoStartCountdown: number; // 30 down to 0
  remainingSeconds: number; // task countdown in seconds
  actualSeconds: number; // accumulated active working time in seconds
  totalDurationSeconds: number; // planned duration in seconds
  showStartingModal: boolean;
  showCompletedModal: boolean;
  isMuted: boolean;
  dataVersion: number;
  completionNotifId: string | null;

  // Actions
  incrementDataVersion: () => void;
  toggleMute: () => void;
  reconcileState: () => Promise<void>;
  tick: () => Promise<void>;
  startTaskNow: (occurrenceId?: string) => Promise<void>;
  pauseTask: (occurrenceId?: string) => Promise<void>;
  resumeTask: (occurrenceId?: string) => Promise<void>;
  finishTask: (occurrenceId?: string) => Promise<void>;
  skipTask: (occurrenceId?: string) => Promise<void>;
  dismissCompletedModal: () => void;
  dismissStartingModal: () => void;
  closeActiveModal: () => void;
  openRunningView: (occId: string) => Promise<void>;
}

export const useTaskExecutionStore = create<TaskExecutionState>((set, get) => ({
  activeOccurrenceId: null,
  activeTask: null,
  activeOccurrence: null,
  executionState: 'idle',
  autoStartCountdown: 30,
  remainingSeconds: 0,
  actualSeconds: 0,
  totalDurationSeconds: 0,
  showStartingModal: false,
  showCompletedModal: false,
  isMuted: false,
  dataVersion: 0,
  completionNotifId: null,

  incrementDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),

  dismissStartingModal: () => set({ showStartingModal: false, executionState: 'idle' }),
  
  closeActiveModal: () => {
    // Closes modal view without modifying task background status
    set({
      showStartingModal: false,
      showCompletedModal: false,
      executionState: 'idle',
      activeOccurrenceId: null,
      activeTask: null,
      activeOccurrence: null,
    });
  },

  dismissCompletedModal: () => {
    set((s) => ({
      showCompletedModal: false,
      executionState: 'idle',
      activeOccurrenceId: null,
      activeTask: null,
      activeOccurrence: null,
      completionNotifId: null,
      dataVersion: s.dataVersion + 1,
    }));
  },

  reconcileState: async () => {
    const now = Date.now();
    const rows = await db
      .select({
        occurrence: occurrence,
        task: task,
      })
      .from(occurrence)
      .innerJoin(task, eq(task.id, occurrence.taskId))
      .where(eq(occurrence.status, 'running'));

    if (rows.length > 0) {
      const { occurrence: occ, task: t } = rows[0];
      const plannedMs = (t.plannedMinutes ?? 30) * 60 * 1000;
      const savedActualMs = occ.actualDuration ?? 0;
      const lastStarted = occ.lastStartedAt ?? now;
      const elapsedSinceResume = Math.max(0, now - lastStarted);
      const totalActualMs = savedActualMs + elapsedSinceResume;
      const remainingMs = plannedMs - totalActualMs;

      if (remainingMs <= 0) {
        // Finished while app was closed or backgrounded
        set({
          activeOccurrenceId: occ.id,
          activeOccurrence: occ,
          activeTask: t,
        });
        await get().finishTask();
      } else {
        const remSec = Math.floor(remainingMs / 1000);
        const actSec = Math.floor(totalActualMs / 1000);
        set({
          activeOccurrenceId: occ.id,
          activeOccurrence: occ,
          activeTask: t,
          executionState: 'running',
          remainingSeconds: remSec,
          actualSeconds: actSec,
          totalDurationSeconds: Math.round(plannedMs / 1000),
          dataVersion: get().dataVersion + 1,
        });
      }
    }
  },

  openRunningView: async (occId: string) => {
    const [occ] = await db.select().from(occurrence).where(eq(occurrence.id, occId));
    if (!occ) return;
    const [t] = await db.select().from(task).where(eq(task.id, occ.taskId));
    if (!t) return;

    const now = Date.now();
    const plannedMs = (t.plannedMinutes ?? 30) * 60 * 1000;
    const totalSec = Math.round(plannedMs / 1000);
    const savedActualMs = occ.actualDuration ?? 0;

    let remSec = Math.max(0, Math.floor((plannedMs - savedActualMs) / 1000));
    let actSec = Math.floor(savedActualMs / 1000);

    if (occ.status === 'running' && occ.lastStartedAt) {
      const elapsed = Math.max(0, now - occ.lastStartedAt);
      const totalActualMs = Math.min(plannedMs, savedActualMs + elapsed);
      actSec = Math.floor(totalActualMs / 1000);
      remSec = Math.max(0, Math.floor((plannedMs - totalActualMs) / 1000));
    }

    set({
      activeOccurrenceId: occ.id,
      activeOccurrence: occ,
      activeTask: t,
      executionState: occ.status === 'running' ? 'running' : occ.status === 'paused' ? 'paused' : 'idle',
      remainingSeconds: remSec,
      actualSeconds: actSec,
      totalDurationSeconds: totalSec,
      showStartingModal: false,
      showCompletedModal: false,
    });
  },

  startTaskNow: async (occurrenceId?: string) => {
    const occId = occurrenceId ?? get().activeOccurrenceId;
    if (!occId) return;

    const [occ] = await db.select().from(occurrence).where(eq(occurrence.id, occId));
    if (!occ) return;
    const [t] = await db.select().from(task).where(eq(task.id, occ.taskId));
    if (!t) return;

    const now = Date.now();
    const plannedMs = (t.plannedMinutes ?? 30) * 60 * 1000;

    // Single active task protection: Pause any other running tasks and save their accurate actual working time
    const runningOccs = await db.select().from(occurrence).where(eq(occurrence.status, 'running'));
    for (const r of runningOccs) {
      if (r.id !== occId && r.lastStartedAt) {
        const [rTask] = await db.select().from(task).where(eq(task.id, r.taskId));
        const rPlannedMs = (rTask?.plannedMinutes ?? 30) * 60 * 1000;
        const elapsed = Math.max(0, now - r.lastStartedAt);
        const rActualMs = Math.min(rPlannedMs, (r.actualDuration ?? 0) + elapsed);
        const rRemMs = Math.max(0, rPlannedMs - rActualMs);
        await db
          .update(occurrence)
          .set({
            status: 'paused',
            actualDuration: rActualMs,
            remainingDuration: rRemMs,
            pausedAt: now,
            lastStartedAt: null,
          })
          .where(eq(occurrence.id, r.id));
      }
    }

    const savedActualMs = occ.actualDuration ?? 0;
    const remainingMs = Math.max(0, plannedMs - savedActualMs);
    const totalSec = Math.round(plannedMs / 1000);
    const remSec = Math.floor(remainingMs / 1000);
    const actSec = Math.floor(savedActualMs / 1000);
    const endTime = now + remainingMs;

    // Schedule OS completion notification at exact endTime
    const completionNotifId = await scheduleCompletionNotification(
      occId,
      t.id,
      t.title,
      t.plannedMinutes ?? 30,
      endTime
    );

    // Update database
    await db
      .update(occurrence)
      .set({
        status: 'running',
        actualStartTime: occ.actualStartTime ?? now,
        lastStartedAt: now,
        pausedAt: null,
        actualDuration: savedActualMs,
        remainingDuration: remainingMs,
      })
      .where(eq(occurrence.id, occId));

    const updatedOcc = {
      ...occ,
      status: 'running' as const,
      actualStartTime: occ.actualStartTime ?? now,
      lastStartedAt: now,
      pausedAt: null,
      actualDuration: savedActualMs,
      remainingDuration: remainingMs,
    };

    set({
      activeOccurrenceId: occId,
      activeOccurrence: updatedOcc,
      activeTask: t,
      executionState: 'running',
      autoStartCountdown: 30,
      remainingSeconds: remSec,
      actualSeconds: actSec,
      totalDurationSeconds: totalSec,
      completionNotifId: completionNotifId,
      showStartingModal: false,
      showCompletedModal: false,
      dataVersion: get().dataVersion + 1,
    });
  },

  pauseTask: async (occurrenceId?: string) => {
    const occId = occurrenceId ?? get().activeOccurrenceId;
    if (!occId) return;

    let activeOcc = get().activeOccurrence;
    let activeT = get().activeTask;

    if (!activeOcc || activeOcc.id !== occId || !activeT) {
      const [dbOcc] = await db.select().from(occurrence).where(eq(occurrence.id, occId));
      if (!dbOcc) return;
      const [dbT] = await db.select().from(task).where(eq(task.id, dbOcc.taskId));
      if (!dbT) return;
      activeOcc = dbOcc;
      activeT = dbT;
    }

    const { completionNotifId, dataVersion } = get();
    const now = Date.now();
    const plannedMs = (activeT.plannedMinutes ?? 30) * 60 * 1000;
    const lastStarted = activeOcc.lastStartedAt ?? now;
    const elapsedSinceResume = activeOcc.lastStartedAt ? Math.max(0, now - lastStarted) : 0;
    const newActualDuration = Math.min(plannedMs, (activeOcc.actualDuration ?? 0) + elapsedSinceResume);
    const newRemainingDuration = Math.max(0, plannedMs - newActualDuration);

    const remSec = Math.floor(newRemainingDuration / 1000);
    const actSec = Math.floor(newActualDuration / 1000);

    // Cancel OS completion notification
    if (completionNotifId) {
      await cancelNotification(completionNotifId);
    }

    await db
      .update(occurrence)
      .set({
        status: 'paused',
        actualDuration: newActualDuration,
        remainingDuration: newRemainingDuration,
        pausedAt: now,
        lastStartedAt: null,
      })
      .where(eq(occurrence.id, occId));

    const updatedOcc = {
      ...activeOcc,
      status: 'paused' as const,
      actualDuration: newActualDuration,
      remainingDuration: newRemainingDuration,
      pausedAt: now,
      lastStartedAt: null,
    };

    set({
      activeOccurrenceId: occId,
      activeOccurrence: updatedOcc,
      activeTask: activeT,
      executionState: 'paused',
      remainingSeconds: remSec,
      actualSeconds: actSec,
      completionNotifId: null,
      showStartingModal: false,
      dataVersion: dataVersion + 1,
    });
  },

  resumeTask: async (occurrenceId?: string) => {
    const occId = occurrenceId ?? get().activeOccurrenceId;
    if (!occId) return;
    await get().startTaskNow(occId);
  },

  finishTask: async (occurrenceId?: string) => {
    const occId = occurrenceId ?? get().activeOccurrenceId;
    if (!occId) return;

    let activeOcc = get().activeOccurrence;
    let activeT = get().activeTask;

    if (!activeOcc || activeOcc.id !== occId || !activeT) {
      const [dbOcc] = await db.select().from(occurrence).where(eq(occurrence.id, occId));
      if (!dbOcc) return;
      const [dbT] = await db.select().from(task).where(eq(task.id, dbOcc.taskId));
      if (!dbT) return;
      activeOcc = dbOcc;
      activeT = dbT;
    }

    const { isMuted, completionNotifId, dataVersion } = get();
    const now = Date.now();
    const plannedMs = (activeT.plannedMinutes ?? 30) * 60 * 1000;

    // Calculate final actual duration
    let finalActualDuration = activeOcc.actualDuration ?? 0;
    if (activeOcc.status === 'running' && activeOcc.lastStartedAt) {
      const elapsed = Math.max(0, now - activeOcc.lastStartedAt);
      finalActualDuration = Math.min(plannedMs, finalActualDuration + elapsed);
    }

    const soundEnabled = activeT.soundEnabled === 1 && !isMuted;
    playTaskCompletionChime(!soundEnabled);

    // Cancel OS completion notification if still scheduled
    if (completionNotifId) {
      await cancelNotification(completionNotifId);
    }

    showSystemNotification(
      'Cadence: Task Completed ✓',
      `${activeT.title ?? 'Task'} is complete!`
    );

    // Update occurrence in database
    await db
      .update(occurrence)
      .set({
        status: 'completed',
        actualEndTime: now,
        actualDuration: finalActualDuration,
        remainingDuration: 0,
        lastStartedAt: null,
        pausedAt: null,
      })
      .where(eq(occurrence.id, occId));

    // Record in completionLog (ensure no duplicates)
    await db.delete(completionLog).where(eq(completionLog.occurrenceId, occId));
    await db.insert(completionLog).values({
      id: generateUUID(),
      occurrenceId: occId,
      status: 'done',
      actualStart: activeOcc.actualStartTime ?? now,
      actualEnd: now,
      actualDuration: finalActualDuration,
      completedAt: now,
    });

    const updatedOcc = {
      ...activeOcc,
      status: 'completed' as const,
      actualEndTime: now,
      actualDuration: finalActualDuration,
      remainingDuration: 0,
      lastStartedAt: null,
      pausedAt: null,
    };

    set({
      activeOccurrenceId: occId,
      activeOccurrence: updatedOcc,
      activeTask: activeT,
      executionState: 'completed',
      showStartingModal: false,
      showCompletedModal: true,
      completionNotifId: null,
      remainingSeconds: 0,
      actualSeconds: Math.floor(finalActualDuration / 1000),
      dataVersion: dataVersion + 1,
    });
  },

  skipTask: async () => {
    const { activeOccurrenceId, completionNotifId, dataVersion } = get();
    if (!activeOccurrenceId) return;

    if (completionNotifId) {
      await cancelNotification(completionNotifId);
    }

    const now = Date.now();
    await db
      .update(occurrence)
      .set({
        status: 'skipped',
        actualEndTime: now,
        remainingDuration: 0,
        lastStartedAt: null,
        pausedAt: null,
      })
      .where(eq(occurrence.id, activeOccurrenceId));

    await db.delete(completionLog).where(eq(completionLog.occurrenceId, activeOccurrenceId));
    await db.insert(completionLog).values({
      id: generateUUID(),
      occurrenceId: activeOccurrenceId,
      status: 'skipped',
      actualStart: null,
      actualEnd: now,
      actualDuration: 0,
      completedAt: now,
    });

    set({
      executionState: 'idle',
      activeOccurrenceId: null,
      activeTask: null,
      activeOccurrence: null,
      completionNotifId: null,
      showStartingModal: false,
      showCompletedModal: false,
      dataVersion: dataVersion + 1,
    });
  },

  tick: async () => {
    const state = get();
    const now = Date.now();

    // 1. If currently in 'starting' state with auto-start countdown active
    if (state.executionState === 'starting' && state.showStartingModal) {
      if (state.autoStartCountdown > 1) {
        set({ autoStartCountdown: state.autoStartCountdown - 1 });
      } else {
        // Auto-start countdown finished (reached 0) -> Start task now!
        await get().startTaskNow();
      }
      return;
    }

    // 2. If currently 'running': Calculate remaining time and active work time from absolute timestamps
    if (state.executionState === 'running' && state.activeOccurrence && state.activeTask) {
      const occ = state.activeOccurrence;
      const plannedMs = (state.activeTask.plannedMinutes ?? 30) * 60 * 1000;
      const savedActualMs = occ.actualDuration ?? 0;
      const lastStarted = occ.lastStartedAt ?? now;
      const elapsedSinceResume = Math.max(0, now - lastStarted);
      const currentTotalActualMs = savedActualMs + elapsedSinceResume;
      const remainingMs = plannedMs - currentTotalActualMs;

      if (remainingMs <= 0) {
        // Task timer reached 0 -> Finish task automatically!
        await get().finishTask();
      } else {
        set({
          remainingSeconds: Math.floor(remainingMs / 1000),
          actualSeconds: Math.floor(currentTotalActualMs / 1000),
        });
      }
      return;
    }

    // 3. If currently 'paused': Timestamps do not increment actual working time
    if (state.executionState === 'paused' && state.activeOccurrence) {
      const occ = state.activeOccurrence;
      const savedActualMs = occ.actualDuration ?? 0;
      const plannedMs = (state.activeTask?.plannedMinutes ?? 30) * 60 * 1000;
      const remainingMs = Math.max(0, plannedMs - savedActualMs);
      set({
        remainingSeconds: Math.floor(remainingMs / 1000),
        actualSeconds: Math.floor(savedActualMs / 1000),
      });
      return;
    }

    // 4. Scan for tasks reaching scheduled start time (only when idle)
    if (state.executionState === 'idle') {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const rows = await db
        .select({
          occurrence: occurrence,
          task: task,
        })
        .from(occurrence)
        .innerJoin(task, eq(task.id, occurrence.taskId))
        .where(eq(occurrence.scheduledDate, todayStr));

      for (const row of rows) {
        const occ = row.occurrence;
        const t = row.task;

        // A. If task is already running in DB, restore it
        if (occ.status === 'running' && occ.lastStartedAt) {
          const plannedMs = (t.plannedMinutes ?? 30) * 60 * 1000;
          const totalSec = Math.round(plannedMs / 1000);
          const elapsed = Math.max(0, now - occ.lastStartedAt);
          const totalActualMs = (occ.actualDuration ?? 0) + elapsed;
          const remainingMs = plannedMs - totalActualMs;

          if (remainingMs > 0) {
            set({
              activeOccurrenceId: occ.id,
              activeOccurrence: occ,
              activeTask: t,
              executionState: 'running',
              remainingSeconds: Math.floor(remainingMs / 1000),
              actualSeconds: Math.floor(totalActualMs / 1000),
              totalDurationSeconds: totalSec,
              dataVersion: state.dataVersion + 1,
            });
            return;
          } else {
            await get().finishTask();
            return;
          }
        }

        // B. Check for scheduled task reaching start time
        if (occ.status === 'scheduled' && occ.sirenTriggered === 0) {
          const taskCreatedAt = t.createdAt ?? 0;
          const scheduledEnd = occ.scheduledEnd ?? (occ.scheduledStart + (t.plannedMinutes ?? 30) * 60 * 1000);

          // If scheduled start was already in the past when created, mark triggered without alerting
          if (occ.scheduledStart < taskCreatedAt) {
            await db
              .update(occurrence)
              .set({ sirenTriggered: 1 })
              .where(eq(occurrence.id, occ.id));
            continue;
          }

          // If current time is past scheduled end time
          if (now > scheduledEnd) {
            await db
              .update(occurrence)
              .set({ sirenTriggered: 1 })
              .where(eq(occurrence.id, occ.id));
            continue;
          }

          // Trigger ONLY if current time has reached or passed scheduled start time
          if (now >= occ.scheduledStart) {
            await db
              .update(occurrence)
              .set({
                sirenTriggered: 1,
                status: t.autoStartEnabled === 1 ? 'starting' : 'scheduled',
              })
              .where(eq(occurrence.id, occ.id));

            const soundEnabled = t.soundEnabled === 1 && !state.isMuted;
            playTaskStartSiren(!soundEnabled);
            showSystemNotification(
              `Cadence: ${t.title} Starting`,
              `${t.title} starts now! Auto-starting in 30 seconds.`
            );

            if (t.autoStartEnabled === 1) {
              const totalSec = (t.plannedMinutes ?? 30) * 60;
              set({
                activeOccurrenceId: occ.id,
                activeOccurrence: { ...occ, status: 'starting', sirenTriggered: 1 },
                activeTask: t,
                executionState: 'starting',
                autoStartCountdown: 30,
                totalDurationSeconds: totalSec,
                remainingSeconds: totalSec,
                actualSeconds: 0,
                showStartingModal: true,
                dataVersion: state.dataVersion + 1,
              });
            } else {
              set({ dataVersion: state.dataVersion + 1 });
            }
            return;
          }
        }
      }
    }
  },
}));
