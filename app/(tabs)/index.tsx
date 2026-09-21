import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { eq, and } from 'drizzle-orm';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { db } from '@/db/client';
import { occurrence, task, completionLog } from '@/db/schema';
import type { Occurrence, Task, CompletionLog, OccurrenceStatus } from '@/db/schema';
import { generateUUID } from '@/lib/uuid';
import { generateOccurrences } from '@/lib/occurrences';
import { OccurrenceCard } from '@/components/OccurrenceCard';
import { ActiveTaskModal } from '@/components/ActiveTaskModal';
import { EmptyState } from '@/components/EmptyState';
import { useTaskExecutionStore } from '@/store/taskExecutionStore';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '@/constants/theme';

interface OccurrenceRow {
  occurrence: Occurrence;
  task: Task;
  completion: CompletionLog | null;
}

function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return '00:00:00';
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function TodayScreen() {
  const [rows, setRows] = useState<OccurrenceRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const {
    activeOccurrenceId,
    executionState,
    remainingSeconds,
    autoStartCountdown,
    dataVersion,
    tick,
    openRunningView,
    startTaskNow,
    pauseTask,
    resumeTask,
    finishTask,
    skipTask,
  } = useTaskExecutionStore();

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Centralized 1-second tick scheduler
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
      tick();
    }, 1000);
    return () => clearInterval(interval);
  }, [tick]);

  const loadData = useCallback(async () => {
    await generateOccurrences();
    const results = await db
      .select({
        occurrence: occurrence,
        task: task,
        completion: completionLog,
      })
      .from(occurrence)
      .innerJoin(task, eq(task.id, occurrence.taskId))
      .leftJoin(completionLog, eq(completionLog.occurrenceId, occurrence.id))
      .where(eq(occurrence.scheduledDate, todayStr))
      .orderBy(occurrence.scheduledStart);

    // Deduplicate occurrences and take first completion
    const seen = new Map<string, OccurrenceRow>();
    for (const row of results) {
      if (!seen.has(row.occurrence.id)) {
        seen.set(row.occurrence.id, {
          occurrence: row.occurrence,
          task: row.task,
          completion: row.completion,
        });
      }
    }

    setRows(Array.from(seen.values()));
  }, [todayStr]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    loadData();
  }, [loadData, dataVersion]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Find the current or next upcoming task for countdown banner
  // Find the current or next upcoming task for countdown banner
  const nextTaskInfo = useMemo(() => {
    // 1. Any task currently starting, running, or paused
    const activeRow =
      rows.find((r) => r.occurrence.id === activeOccurrenceId) ||
      rows.find((r) => r.occurrence.status === 'running') ||
      rows.find((r) => r.occurrence.status === 'paused') ||
      rows.find((r) => r.occurrence.status === 'starting');

    if (activeRow) {
      return {
        row: activeRow,
        type: (activeRow.occurrence.status as OccurrenceStatus) || executionState,
      };
    }

    // 2. Next scheduled pending task
    const upcoming = rows
      .filter((r) => !r.completion && r.occurrence.status !== 'completed' && r.occurrence.status !== 'skipped')
      .sort((a, b) => a.occurrence.scheduledStart - b.occurrence.scheduledStart);

    if (upcoming.length > 0) {
      return {
        row: upcoming[0],
        type: 'upcoming' as const,
      };
    }

    return null;
  }, [rows, activeOccurrenceId, executionState]);

  // Handle completion toggle
  const handleDoneToggle = useCallback(
    async (occId: string) => {
      const existing = await db
        .select()
        .from(completionLog)
        .where(eq(completionLog.occurrenceId, occId));

      if (existing.length > 0 && existing[0].status === 'done') {
        await db.delete(completionLog).where(eq(completionLog.occurrenceId, occId));
        await db.update(occurrence).set({ status: 'scheduled' }).where(eq(occurrence.id, occId));
      } else {
        const [occ] = await db.select().from(occurrence).where(eq(occurrence.id, occId));
        const [t] = occ ? await db.select().from(task).where(eq(task.id, occ.taskId)) : [null];
        const plannedMs = (t?.plannedMinutes ?? 30) * 60 * 1000;
        const actualMs = occ?.actualDuration && occ.actualDuration > 0 ? occ.actualDuration : plannedMs;

        await db.delete(completionLog).where(eq(completionLog.occurrenceId, occId));
        await db.insert(completionLog).values({
          id: generateUUID(),
          occurrenceId: occId,
          status: 'done',
          actualStart: occ?.actualStartTime ?? null,
          actualEnd: Date.now(),
          actualDuration: actualMs,
          completedAt: Date.now(),
        });
        await db
          .update(occurrence)
          .set({ status: 'completed', actualDuration: actualMs, actualEndTime: Date.now(), remainingDuration: 0 })
          .where(eq(occurrence.id, occId));
      }
      useTaskExecutionStore.getState().incrementDataVersion();
      await loadData();
    },
    [loadData]
  );

  const handleSkipOccurrence = useCallback(
    async (occId: string) => {
      await db.delete(completionLog).where(eq(completionLog.occurrenceId, occId));
      await db.insert(completionLog).values({
        id: generateUUID(),
        occurrenceId: occId,
        status: 'skipped',
        actualStart: null,
        actualEnd: null,
        actualDuration: 0,
        completedAt: Date.now(),
      });
      await db.update(occurrence).set({ status: 'skipped' }).where(eq(occurrence.id, occId));
      await loadData();
    },
    [loadData]
  );

  const total = rows.length;
  const completed = rows.filter(
    (r) => r.completion?.status === 'done' || r.occurrence.status === 'completed'
  ).length;

  const renderItem = useCallback(
    ({ item }: { item: OccurrenceRow }) => (
      <OccurrenceCard
        occurrence={item.occurrence}
        task={item.task}
        completion={item.completion}
        onOpenRunning={() => openRunningView(item.occurrence.id)}
        onStartNow={() => startTaskNow(item.occurrence.id)}
        onPause={() => pauseTask(item.occurrence.id)}
        onResume={() => resumeTask(item.occurrence.id)}
        onFinish={() => finishTask(item.occurrence.id)}
        onSkip={() => handleSkipOccurrence(item.occurrence.id)}
        onDoneToggle={() => handleDoneToggle(item.occurrence.id)}
      />
    ),
    [
      openRunningView,
      startTaskNow,
      pauseTask,
      resumeTask,
      finishTask,
      handleSkipOccurrence,
      handleDoneToggle,
    ]
  );

  return (
    <SafeAreaView style={styles.container}>
      <ActiveTaskModal />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.greeting}>Today</Text>
            <Text style={styles.dateText}>
              {format(new Date(), 'EEEE, MMMM d')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addTaskBtn}
            onPress={() => router.push('/task/new')}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addTaskBtnText}>New Task</Text>
          </TouchableOpacity>
        </View>

        {total > 0 && (
          <View style={styles.progressRow}>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${total > 0 ? (completed / total) * 100 : 0}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {completed}/{total}
            </Text>
          </View>
        )}
      </View>

      {/* ─── NEXT TASK COUNTDOWN BANNER ─── */}
      {nextTaskInfo && (
        <View style={styles.nextTaskCard}>
          <View style={styles.nextTaskHeader}>
            <View style={styles.nextTaskBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.nextTaskBadgeText}>
                {nextTaskInfo.type === 'running'
                  ? 'TASK IN PROGRESS'
                  : nextTaskInfo.type === 'starting'
                  ? 'STARTING SOON'
                  : nextTaskInfo.type === 'paused'
                  ? 'TASK PAUSED'
                  : 'NEXT TASK'}
              </Text>
            </View>

            <Text style={styles.nextTaskTimeSpan}>
              {format(new Date(nextTaskInfo.row.occurrence.scheduledStart), 'hh:mm a')} →{' '}
              {format(
                new Date(
                  nextTaskInfo.row.occurrence.scheduledEnd ??
                    nextTaskInfo.row.occurrence.scheduledStart +
                      (nextTaskInfo.row.task.plannedMinutes ?? 30) * 60 * 1000
                ),
                'hh:mm a'
              )}
            </Text>
          </View>

          <Text style={styles.nextTaskTitle} numberOfLines={1}>
            {nextTaskInfo.row.task.title}
          </Text>

          <View style={styles.nextTaskBottom}>
            <View style={styles.countdownArea}>
              <Text style={styles.countdownLabel}>
                {nextTaskInfo.type === 'running'
                  ? 'Time Remaining'
                  : nextTaskInfo.type === 'starting'
                  ? 'Auto-Starts In'
                  : nextTaskInfo.type === 'paused'
                  ? 'Paused At'
                  : 'Starts In'}
              </Text>
              <Text style={styles.countdownDigits}>
                {nextTaskInfo.type === 'running' || nextTaskInfo.type === 'paused'
                  ? `${Math.floor(remainingSeconds / 60)
                      .toString()
                      .padStart(2, '0')}:${(remainingSeconds % 60)
                      .toString()
                      .padStart(2, '0')}`
                  : nextTaskInfo.type === 'starting'
                  ? `00:00:${autoStartCountdown.toString().padStart(2, '0')}`
                  : formatCountdown(nextTaskInfo.row.occurrence.scheduledStart - nowMs)}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.nextTaskActionBtn}
              onPress={() => {
                if (nextTaskInfo.type === 'running') {
                  openRunningView(nextTaskInfo.row.occurrence.id);
                } else if (nextTaskInfo.type === 'paused') {
                  resumeTask(nextTaskInfo.row.occurrence.id);
                } else {
                  startTaskNow(nextTaskInfo.row.occurrence.id);
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={nextTaskInfo.type === 'running' ? 'timer' : 'play'}
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.nextTaskActionBtnText}>
                {nextTaskInfo.type === 'running'
                  ? 'Open Timer'
                  : nextTaskInfo.type === 'paused'
                  ? 'Resume'
                  : 'Start Now'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* List of Today Occurrences */}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.occurrence.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accentPrimary}
            colors={[Colors.accentPrimary]}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="sunny-outline"
            title="Nothing scheduled"
            subtitle="Create a task to get started with your daily rhythm."
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  dateText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  addTaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accentPrimary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    ...Shadow.sm,
  },
  addTaskBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.md,
    gap: Spacing.md,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.accentPrimary,
    borderRadius: 3,
  },
  progressText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  nextTaskCard: {
    backgroundColor: '#15132A',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#2F2959',
    ...Shadow.md,
  },
  nextTaskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextTaskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(108, 92, 231, 0.2)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accentPrimary,
  },
  nextTaskBadgeText: {
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    color: Colors.accentPrimary,
    letterSpacing: 1,
  },
  nextTaskTimeSpan: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  nextTaskTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  nextTaskBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#252047',
  },
  countdownArea: {},
  countdownLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: Colors.textTertiary,
    letterSpacing: 0.5,
  },
  countdownDigits: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
    letterSpacing: 0.5,
  },
  nextTaskActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.accentPrimary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.md,
  },
  nextTaskActionBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  listContent: {
    paddingTop: Spacing.xs,
    paddingBottom: 100,
  },
});
