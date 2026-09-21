import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { db } from '@/db/client';
import migrations from '@/drizzle/migrations';

export function useDatabaseMigrations() {
  return useMigrations(db as any, migrations);
}
