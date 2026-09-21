import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const expo = SQLite.openDatabaseSync('cadence.db', {
  enableChangeListener: true,
});

// Enable WAL mode and foreign keys for performance and data integrity
expo.execSync('PRAGMA journal_mode = WAL;');
expo.execSync('PRAGMA foreign_keys = ON;');

// Safe schema migration for existing SQLite databases (iOS, Android, macOS)
const migrationStatements = [
  'ALTER TABLE task ADD COLUMN description text',
  'ALTER TABLE task ADD COLUMN priority text DEFAULT "medium"',
  'ALTER TABLE task ADD COLUMN soundEnabled integer DEFAULT 1',
  'ALTER TABLE task ADD COLUMN autoStartEnabled integer DEFAULT 1',
  'ALTER TABLE occurrence ADD COLUMN notificationId text',
  'ALTER TABLE occurrence ADD COLUMN scheduledEnd integer',
  'ALTER TABLE occurrence ADD COLUMN actualStartTime integer',
  'ALTER TABLE occurrence ADD COLUMN actualEndTime integer',
  'ALTER TABLE occurrence ADD COLUMN actualDuration integer DEFAULT 0',
  'ALTER TABLE occurrence ADD COLUMN remainingDuration integer',
  'ALTER TABLE occurrence ADD COLUMN lastStartedAt integer',
  'ALTER TABLE occurrence ADD COLUMN pausedAt integer',
  'ALTER TABLE occurrence ADD COLUMN sirenTriggered integer DEFAULT 0',
  'ALTER TABLE completionLog ADD COLUMN actualDuration integer',
];

for (const stmt of migrationStatements) {
  try {
    expo.execSync(stmt);
  } catch {
    // Column already exists or table not yet created
  }
}

export const db = drizzle(expo, { schema });
export type Database = typeof db;
