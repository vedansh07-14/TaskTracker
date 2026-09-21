import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

// ─── task ────────────────────────────────────────────────────────────────────
export const task = sqliteTable('task', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'), // Optional notes / details
  category: text('category'),
  priority: text('priority').default('medium'), // 'low' | 'medium' | 'high'
  plannedMinutes: integer('plannedMinutes'),
  recurrenceRule: text('recurrenceRule'), // 'daily' | 'weekdays' | 'weekly:1,3,5' | 'once'
  defaultStartTime: text('defaultStartTime'), // 'HH:mm'
  soundEnabled: integer('soundEnabled').default(1), // boolean
  autoStartEnabled: integer('autoStartEnabled').default(1), // boolean
  active: integer('active').default(1), // boolean
  createdAt: integer('createdAt'), // unix ms
});

// ─── occurrence ──────────────────────────────────────────────────────────────
export const occurrence = sqliteTable(
  'occurrence',
  {
    id: text('id').primaryKey(),
    taskId: text('taskId')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    scheduledDate: text('scheduledDate').notNull(), // 'YYYY-MM-DD'
    scheduledStart: integer('scheduledStart').notNull(), // unix ms
    scheduledEnd: integer('scheduledEnd'), // unix ms
    notificationId: text('notificationId'), // id returned by expo-notifications
    status: text('status').default('scheduled').notNull(), // 'scheduled' | 'starting' | 'running' | 'paused' | 'completed' | 'skipped'
    actualStartTime: integer('actualStartTime'), // unix ms (startedAt)
    actualEndTime: integer('actualEndTime'), // unix ms (completedAt)
    actualDuration: integer('actualDuration').default(0), // total active working time in ms
    remainingDuration: integer('remainingDuration'), // milliseconds remaining
    lastStartedAt: integer('lastStartedAt'), // unix ms when timer last resumed (resumedAt)
    pausedAt: integer('pausedAt'), // unix ms when timer last paused
    sirenTriggered: integer('sirenTriggered').default(0), // boolean flag to avoid duplicate alarms
  },
  (table) => [
    uniqueIndex('uq_task_date').on(table.taskId, table.scheduledDate),
    index('idx_scheduled_date').on(table.scheduledDate),
    index('idx_occurrence_status').on(table.status),
  ]
);

// ─── completionLog ───────────────────────────────────────────────────────────
export const completionLog = sqliteTable(
  'completionLog',
  {
    id: text('id').primaryKey(),
    occurrenceId: text('occurrenceId')
      .notNull()
      .references(() => occurrence.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // 'done' | 'skipped' | 'missed'
    actualStart: integer('actualStart'), // unix ms
    actualEnd: integer('actualEnd'), // unix ms
    actualDuration: integer('actualDuration'), // active working ms
    completedAt: integer('completedAt').notNull(), // unix ms
  },
  (table) => [index('idx_completion_occurrence').on(table.occurrenceId)]
);

// ─── Type exports ────────────────────────────────────────────────────────────
export type Task = typeof task.$inferSelect;
export type NewTask = typeof task.$inferInsert;
export type Occurrence = typeof occurrence.$inferSelect;
export type NewOccurrence = typeof occurrence.$inferInsert;
export type CompletionLog = typeof completionLog.$inferSelect;
export type NewCompletionLog = typeof completionLog.$inferInsert;

export type TaskPriority = 'low' | 'medium' | 'high';
export type OccurrenceStatus =
  | 'scheduled'
  | 'starting'
  | 'running'
  | 'paused'
  | 'completed'
  | 'skipped';
export type RecurrenceRule = 'daily' | 'weekdays' | 'once' | `weekly:${string}`;
export type CompletionStatus = 'done' | 'skipped' | 'missed';
