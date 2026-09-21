import { format, startOfDay } from 'date-fns';
import { eq, lt, and, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { occurrence, completionLog } from '@/db/schema';
import { generateUUID } from '@/lib/uuid';

/**
 * Sweep for missed occurrences on app launch.
 *
 * Any occurrence whose scheduledStart is in the past (before today)
 * with no corresponding completionLog row gets a 'missed' row written.
 *
 * This ensures analytics always have explicit rows for missed tasks,
 * rather than inferring misses from absence.
 */
export async function sweepMissedOccurrences(): Promise<number> {
  const now = Date.now();
  const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd');

  // Find past occurrences with no completion log entry
  // We look for occurrences before today (not including today — today's tasks
  // haven't been "missed" yet, they're just upcoming)
  const missedOccurrences = await db
    .select({
      occurrenceId: occurrence.id,
    })
    .from(occurrence)
    .leftJoin(completionLog, eq(completionLog.occurrenceId, occurrence.id))
    .where(
      and(
        lt(occurrence.scheduledDate, todayStr),
        sql`${completionLog.id} IS NULL`
      )
    );

  let created = 0;

  for (const row of missedOccurrences) {
    try {
      await db.insert(completionLog).values({
        id: generateUUID(),
        occurrenceId: row.occurrenceId,
        status: 'missed',
        actualStart: null,
        actualEnd: null,
        completedAt: now,
      });
      created++;
    } catch {
      // Skip if somehow a concurrent write created the row
    }
  }

  return created;
}
