import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { task } from '@/db/schema';
import type { Task } from '@/db/schema';
import { generateOccurrencesForTask, generateOccurrences } from '@/lib/occurrences';
import { cancelAllForTask, rescheduleForTask } from '@/lib/notifications';
import { useTaskExecutionStore } from '@/store/taskExecutionStore';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '@/constants/theme';

const RECURRENCE_LABELS: Record<string, string> = {
  daily: 'Every day',
  weekdays: 'Weekdays',
  once: 'Once',
};

function getRecurrenceLabel(rule: string | null): string {
  if (!rule) return 'No recurrence';
  if (RECURRENCE_LABELS[rule]) return RECURRENCE_LABELS[rule];
  if (rule.startsWith('weekly:')) {
    const days = rule.slice('weekly:'.length).split(',');
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days.map((d) => dayNames[Number(d)] ?? d).join(', ');
  }
  return rule;
}

function getCategoryColor(category: string | null): string {
  if (!category) return Colors.textTertiary;
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % Colors.categoryColors.length;
  return Colors.categoryColors[index];
}

export default function TasksScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const dataVersion = useTaskExecutionStore((s) => s.dataVersion);

  const loadTasks = useCallback(async () => {
    const allTasks = await db.select().from(task).orderBy(task.title);
    setTasks(allTasks);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks])
  );

  useEffect(() => {
    loadTasks();
  }, [loadTasks, dataVersion]);

  const handleToggleActive = useCallback(
    async (t: Task) => {
      const newActive = t.active === 1 ? 0 : 1;
      await db.update(task).set({ active: newActive }).where(eq(task.id, t.id));

      if (newActive === 0) {
        await cancelAllForTask(t.id);
      } else {
        await generateOccurrencesForTask({ ...t, active: 1 });
        await generateOccurrences();
        await rescheduleForTask(t.id);
      }

      useTaskExecutionStore.getState().incrementDataVersion();
      await loadTasks();
    },
    [loadTasks]
  );

  const performDelete = useCallback(
    async (taskId: string) => {
      await cancelAllForTask(taskId);
      await db.delete(task).where(eq(task.id, taskId));
      useTaskExecutionStore.getState().incrementDataVersion();
      await loadTasks();
    },
    [loadTasks]
  );

  const handleDelete = useCallback(
    (t: Task) => {
      if (Platform.OS === 'web') {
        const confirmed = window.confirm(
          `Are you sure you want to delete "${t.title}"? All occurrences and history will be lost.`
        );
        if (confirmed) {
          performDelete(t.id);
        }
      } else {
        Alert.alert(
          'Delete Task',
          `Are you sure you want to delete "${t.title}"? All occurrences and history will be lost.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => performDelete(t.id),
            },
          ]
        );
      }
    },
    [performDelete]
  );

  const filteredTasks = showInactive
    ? tasks
    : tasks.filter((t) => t.active === 1);

  const activeTasks = filteredTasks.filter((t) => t.active === 1);
  const inactiveTasks = filteredTasks.filter((t) => t.active !== 1);

  const renderTask = useCallback(
    ({ item }: { item: Task }) => {
      const catColor = getCategoryColor(item.category);
      const isActive = item.active === 1;

      return (
        <TouchableOpacity
          style={[styles.taskCard, !isActive && styles.taskCardInactive]}
          onPress={() => router.push(`/task/${item.id}`)}
          activeOpacity={0.7}
        >
          <View style={styles.taskLeft}>
            <View style={styles.taskTitleRow}>
              <Text
                style={[styles.taskTitle, !isActive && styles.taskTitleInactive]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              {!isActive && (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>Paused</Text>
                </View>
              )}
            </View>

            <View style={styles.taskMeta}>
              {item.category && (
                <View style={styles.metaItem}>
                  <View
                    style={[styles.metaDot, { backgroundColor: catColor }]}
                  />
                  <Text style={[styles.metaText, { color: catColor }]}>
                    {item.category}
                  </Text>
                </View>
              )}
              <View style={styles.metaItem}>
                <Ionicons
                  name="repeat"
                  size={12}
                  color={Colors.textTertiary}
                />
                <Text style={styles.metaText}>
                  {getRecurrenceLabel(item.recurrenceRule)}
                </Text>
              </View>
              {item.plannedMinutes && (
                <View style={styles.metaItem}>
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={Colors.textTertiary}
                  />
                  <Text style={styles.metaText}>
                    {item.plannedMinutes}m
                  </Text>
                </View>
              )}
              {item.defaultStartTime && (
                <View style={styles.metaItem}>
                  <Ionicons
                    name="alarm-outline"
                    size={12}
                    color={Colors.textTertiary}
                  />
                  <Text style={styles.metaText}>
                    {item.defaultStartTime}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.taskActions}>
            <TouchableOpacity
              onPress={() => handleToggleActive(item)}
              style={styles.iconBtn}
              hitSlop={8}
            >
              <Ionicons
                name={isActive ? 'pause-circle-outline' : 'play-circle-outline'}
                size={22}
                color={isActive ? Colors.textTertiary : Colors.done}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={styles.iconBtn}
              hitSlop={8}
            >
              <Ionicons
                name="trash-outline"
                size={18}
                color={Colors.missed}
              />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    },
    [handleToggleActive, handleDelete]
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tasks</Text>
        <View style={styles.headerRight}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Show inactive</Text>
            <Switch
              value={showInactive}
              onValueChange={setShowInactive}
              trackColor={{
                false: Colors.surfaceElevated,
                true: Colors.accentPrimary,
              }}
              thumbColor={Colors.textPrimary}
            />
          </View>
        </View>
      </View>

      <FlatList
        data={[...activeTasks, ...inactiveTasks]}
        keyExtractor={(item) => item.id}
        renderItem={renderTask}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name="add-circle-outline"
              size={48}
              color={Colors.textTertiary}
            />
            <Text style={styles.emptyTitle}>No tasks yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the + button to create your first task
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/task/new')}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={28} color={Colors.textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerRight: {},
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  toggleLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  listContent: {
    paddingTop: Spacing.sm,
    paddingBottom: 100,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Shadow.sm,
  },
  taskCardInactive: {
    opacity: 0.5,
  },
  taskLeft: {
    flex: 1,
    marginRight: Spacing.md,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  taskTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  taskTitleInactive: {
    color: Colors.textSecondary,
  },
  inactiveBadge: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  inactiveBadgeText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  taskActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  iconBtn: {
    padding: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.lg,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
});
