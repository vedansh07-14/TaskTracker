import {
  addDays,
  format,
  getDay,
  isAfter,
  isBefore,
  parse,
  startOfDay,
  setHours,
  setMinutes,
  addMinutes,
} from 'date-fns';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { task, occurrence } from '@/db/schema';
import type { Task, NewOccurrence } from '@/db/schema';
import { generateUUID } from '@/lib/uuid';

const HORIZON_DAYS = 14;

/**
 * Parse 'HH:mm' string into { hours, minutes }.
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h ?? 9, minutes: m ?? 0 };
}

/**
 * Determine if a given date matches the task's recurrence rule.
 */
function matchesRecurrence(date: Date, rule: string, createdAt: number): boolean {
  if (rule === 'daily') {
    return true;
  }

  if (rule === 'weekdays') {
    const dow = getDay(date); // 0 = Sunday
    return dow >= 1 && dow <= 5;
  }

  if (rule === 'once') {
    // Only match the creation date
    const createdDate = startOfDay(new Date(createdAt));
    return startOfDay(date).getTime() === createdDate.getTime();
  }

  if (rule.startsWith('weekly:')) {
    const daysStr = rule.slice('weekly:'.length);
    const days = daysStr.split(',').map(Number); // e.g. [1, 3, 5]
    const dow = getDay(date);
    return days.includes(dow);
  }

  return false;
}

/**
 * Generate occurrences for the next HORIZON_DAYS for every active task.
 * Idempotent: uses INSERT OR IGNORE with the unique(taskId, scheduledDate) constraint.
 */
export async function generateOccurrences(): Promise<number> {
  const today = startOfDay(new Date());
  const horizon = addDays(today, HORIZON_DAYS);

  // Fetch all active tasks
  const activeTasks = await db
    .select()
    .from(task)
    .where(eq(task.active, 1));

  let created = 0;

  for (const t of activeTasks) {
    if (!t.recurrenceRule) continue;

    const newOccurrences: NewOccurrence[] = [];
    let current = new Date(today);

    while (isBefore(current, horizon) || current.getTime() === horizon.getTime()) {
      if (matchesRecurrence(current, t.recurrenceRule, t.createdAt ?? Date.now())) {
        const dateStr = format(current, 'yyyy-MM-dd');
        const { hours, minutes } = parseTime(t.defaultStartTime ?? '09:00');

        let scheduledStart = setMinutes(setHours(current, hours), minutes);
        const scheduledStartMs = scheduledStart.getTime();

        let scheduledEndMs: number | null = null;
        if (t.plannedMinutes) {
          scheduledEndMs = addMinutes(scheduledStart, t.plannedMinutes).getTime();
        }

        const createdTime = t.createdAt ?? Date.now();
        const isPastAtCreation = scheduledStartMs < createdTime;

        newOccurrences.push({
          id: generateUUID(),
          taskId: t.id,
          scheduledDate: dateStr,
          scheduledStart: scheduledStartMs,
          scheduledEnd: scheduledEndMs,
          notificationId: null,
          status: 'scheduled',
          actualStartTime: null,
          actualEndTime: null,
          remainingDuration: (t.plannedMinutes ?? 30) * 60 * 1000,
          lastStartedAt: null,
          sirenTriggered: isPastAtCreation ? 1 : 0,
        });
      }

      current = addDays(current, 1);
    }

    // Batch insert with INSERT OR IGNORE for idempotency
    for (const occ of newOccurrences) {
      try {
        await db
          .insert(occurrence)
          .values(occ)
          .onConflictDoNothing({
            target: [occurrence.taskId, occurrence.scheduledDate],
          });
        created++;
      } catch {
        // Silently skip duplicates — the unique constraint protects us
      }
    }
  }

  return created;
}

/**
 * Generate occurrences for a specific task only.
 * Used after task creation or edit.
 */
export async function generateOccurrencesForTask(taskData: Task): Promise<void> {
  if (!taskData.recurrenceRule || !taskData.active) return;

  const today = startOfDay(new Date());
  const horizon = addDays(today, HORIZON_DAYS);

  let current = new Date(today);
  const createdTime = taskData.createdAt ?? Date.now();

  while (isBefore(current, horizon) || current.getTime() === horizon.getTime()) {
    if (matchesRecurrence(current, taskData.recurrenceRule, createdTime)) {
      const dateStr = format(current, 'yyyy-MM-dd');
      const { hours, minutes } = parseTime(taskData.defaultStartTime ?? '09:00');

      let scheduledStart = setMinutes(setHours(current, hours), minutes);
      const scheduledStartMs = scheduledStart.getTime();

      let scheduledEndMs: number | null = null;
      if (taskData.plannedMinutes) {
        scheduledEndMs = addMinutes(scheduledStart, taskData.plannedMinutes).getTime();
      }

      const isPastAtCreation = scheduledStartMs < createdTime;

      try {
        await db
          .insert(occurrence)
          .values({
            id: generateUUID(),
            taskId: taskData.id,
            scheduledDate: dateStr,
            scheduledStart: scheduledStartMs,
            scheduledEnd: scheduledEndMs,
            notificationId: null,
            status: 'scheduled',
            actualStartTime: null,
            actualEndTime: null,
            remainingDuration: (taskData.plannedMinutes ?? 30) * 60 * 1000,
            lastStartedAt: null,
            sirenTriggered: isPastAtCreation ? 1 : 0,
          })
          .onConflictDoNothing({
            target: [occurrence.taskId, occurrence.scheduledDate],
          });
      } catch {
        // Skip duplicates
      }
    }

    current = addDays(current, 1);
  }
}
