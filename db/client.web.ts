// @ts-ignore
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as schema from './schema';

let sqlJsPromise: Promise<any> | null = null;
let sqlDb: any = null;

async function getSqlDb() {
  if (sqlDb) return sqlDb;
  if (!sqlJsPromise) {
    sqlJsPromise = (async () => {
      try {
        const SQL = await initSqlJs();

        // Try to load persisted database from localStorage
        let dbInstance: any = null;
        try {
          const saved = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('cadence_sqlite_db') : null;
          if (saved) {
            const binaryArray = new Uint8Array(JSON.parse(saved));
            dbInstance = new SQL.Database(binaryArray);
          }
        } catch (e) {
          console.warn('Could not restore database from localStorage:', e);
        }

        if (!dbInstance) {
          dbInstance = new SQL.Database();
        }

        // Initialize schema tables matching schema.ts
        dbInstance.run(`
          CREATE TABLE IF NOT EXISTS task (
            id text PRIMARY KEY NOT NULL,
            title text NOT NULL,
            description text,
            category text,
            priority text DEFAULT 'medium',
            plannedMinutes integer,
            recurrenceRule text,
            defaultStartTime text,
            soundEnabled integer DEFAULT 1,
            autoStartEnabled integer DEFAULT 1,
            active integer DEFAULT 1,
            createdAt integer
          );
          CREATE TABLE IF NOT EXISTS occurrence (
            id text PRIMARY KEY NOT NULL,
            taskId text NOT NULL REFERENCES task(id) ON DELETE CASCADE,
            scheduledDate text NOT NULL,
            scheduledStart integer NOT NULL,
            scheduledEnd integer,
            notificationId text,
            status text DEFAULT 'scheduled' NOT NULL,
            actualStartTime integer,
            actualEndTime integer,
            actualDuration integer DEFAULT 0,
            remainingDuration integer,
            lastStartedAt integer,
            pausedAt integer,
            sirenTriggered integer DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS completionLog (
            id text PRIMARY KEY NOT NULL,
            occurrenceId text NOT NULL REFERENCES occurrence(id) ON DELETE CASCADE,
            status text NOT NULL,
            actualStart integer,
            actualEnd integer,
            actualDuration integer,
            completedAt integer NOT NULL
          );
          CREATE UNIQUE INDEX IF NOT EXISTS uq_task_date ON occurrence(taskId, scheduledDate);
          CREATE INDEX IF NOT EXISTS idx_scheduled_date ON occurrence(scheduledDate);
          CREATE INDEX IF NOT EXISTS idx_occurrence_status ON occurrence(status);
          CREATE INDEX IF NOT EXISTS idx_completion_occurrence ON completionLog(occurrenceId);
        `);

        // Safe auto-migration for existing localStorage databases
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
            dbInstance.run(stmt);
          } catch {
            // Column already exists, ignore
          }
        }

        return dbInstance;
      } catch (err) {
        console.error('Failed to initialize sql.js:', err);
        throw err;
      }
    })();
  }
  sqlDb = await sqlJsPromise;
  return sqlDb;
}

export const db = drizzle(
  async (sqlStr: string, params: any[], method: 'run' | 'all' | 'values' | 'get') => {
    const sdb = await getSqlDb();
    try {
      if (method === 'run') {
        sdb.run(sqlStr, params);
        // Persist on mutations
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            const data = sdb.export();
            window.localStorage.setItem('cadence_sqlite_db', JSON.stringify(Array.from(data)));
          } catch (e) {}
        }
        return { rows: [] };
      }

      const stmt = sdb.prepare(sqlStr);
      stmt.bind(params);
      const rows: any[] = [];
      while (stmt.step()) {
        rows.push(stmt.get());
      }
      stmt.free();

      // Persist on write mutations that might use all/get
      if (
        typeof window !== 'undefined' &&
        window.localStorage &&
        (sqlStr.trim().toUpperCase().startsWith('INSERT') ||
          sqlStr.trim().toUpperCase().startsWith('UPDATE') ||
          sqlStr.trim().toUpperCase().startsWith('DELETE'))
      ) {
        try {
          const data = sdb.export();
          window.localStorage.setItem('cadence_sqlite_db', JSON.stringify(Array.from(data)));
        } catch (e) {}
      }

      if (method === 'get') {
        return { rows: rows[0] ?? [] };
      }

      return { rows };
    } catch (e) {
      console.warn('SQLite Proxy Query error:', e, '\nQuery:', sqlStr, '\nParams:', params);
      return { rows: [] };
    }
  },
  { schema }
);

export type Database = typeof db;
