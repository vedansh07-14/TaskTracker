import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '@/constants/theme';
import type { Occurrence, CompletionLog, Task, OccurrenceStatus } from '@/db/schema';

interface OccurrenceCardProps {
  occurrence: Occurrence;
  task: Task;
  completion: CompletionLog | null;
  onOpenRunning?: () => void;
  onStartNow?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onFinish?: () => void;
  onSkip?: () => void;
  onDoneToggle?: () => void;
}

function getPriorityColor(priority: string | null): { color: string; bg: string; label: string } {
  switch (priority) {
    case 'high':
      return { color: Colors.missed, bg: 'rgba(255, 71, 87, 0.12)', label: 'High Priority' };
    case 'low':
      return { color: Colors.textTertiary, bg: 'rgba(140, 140, 160, 0.12)', label: 'Low Priority' };
    case 'medium':
    default:
      return { color: Colors.accentPrimary, bg: 'rgba(108, 92, 231, 0.12)', label: 'Medium Priority' };
  }
}

function getRecurrenceText(rule: string | null): string {
  if (!rule || rule === 'daily') return 'Every day';
  if (rule === 'weekdays') return 'Weekdays';
  if (rule === 'once') return 'Once';
  if (rule.startsWith('weekly:')) {
    const days = rule.slice('weekly:'.length).split(',');
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days.map((d) => dayNames[Number(d)] ?? d).join(', ');
  }
  return rule;
}

function getStatusBadge(
  status: OccurrenceStatus | string,
  completion: CompletionLog | null
): { label: string; color: string; bg: string; icon: React.ComponentProps<typeof Ionicons>['name'] } {
  if (completion?.status === 'done' || status === 'completed') {
    return { label: 'Completed', color: Colors.done, bg: Colors.doneBg, icon: 'checkmark-circle' };
  }
  if (completion?.status === 'skipped' || status === 'skipped') {
    return { label: 'Skipped', color: Colors.skipped, bg: Colors.skippedBg, icon: 'arrow-forward-circle' };
  }
  if (completion?.status === 'missed') {
    return { label: 'Missed', color: Colors.missed, bg: Colors.missedBg, icon: 'close-circle' };
  }

  switch (status) {
    case 'running':
      return { label: 'Running', color: Colors.done, bg: 'rgba(0, 208, 156, 0.15)', icon: 'play-circle' };
    case 'starting':
      return { label: 'Starting', color: Colors.accentPrimary, bg: 'rgba(108, 92, 231, 0.2)', icon: 'alert-circle' };
    case 'paused':
      return { label: 'Paused', color: Colors.accentPrimary, bg: 'rgba(108, 92, 231, 0.12)', icon: 'pause-circle' };
    case 'scheduled':
    default:
      return { label: 'Scheduled', color: Colors.textSecondary, bg: Colors.surfaceElevated, icon: 'calendar-outline' };
  }
}

function formatDuration(ms?: number | null): string {
  if (!ms || ms <= 0) return '0 min';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s} sec`;
  if (s === 0) return `${m} min`;
  return `${m}m ${s}s`;
}

export function OccurrenceCard({
  occurrence: occ,
  task: taskData,
  completion,
  onOpenRunning,
  onStartNow,
  onPause,
  onResume,
  onFinish,
  onSkip,
  onDoneToggle,
}: OccurrenceCardProps) {
  const currentStatus = (occ.status as OccurrenceStatus) || (completion?.status === 'done' ? 'completed' : 'scheduled');
  const isCompleted = currentStatus === 'completed' || completion?.status === 'done';
  const isSkipped = currentStatus === 'skipped' || completion?.status === 'skipped';
  const isRunning = currentStatus === 'running';
  const isPaused = currentStatus === 'paused';
  const isStarting = currentStatus === 'starting';

  const startTimeStr = format(new Date(occ.scheduledStart), 'hh:mm a');
  const endTimeMs = occ.scheduledEnd ?? (occ.scheduledStart + (taskData.plannedMinutes ?? 30) * 60 * 1000);
  const endTimeStr = format(new Date(endTimeMs), 'hh:mm a');

  const priorityInfo = getPriorityColor(taskData.priority);
  const statusBadge = getStatusBadge(currentStatus, completion);
  const recurrenceText = getRecurrenceText(taskData.recurrenceRule);

  const actualTimeSpentMs =
    (completion?.actualDuration ?? occ.actualDuration ?? 0) +
    (isRunning && occ.lastStartedAt ? Math.max(0, Date.now() - occ.lastStartedAt) : 0);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isRunning && styles.cardRunning,
        isStarting && styles.cardStarting,
        isCompleted && styles.cardCompleted,
        isSkipped && styles.cardSkipped,
      ]}
      onPress={() => {
        if (isRunning) {
          onOpenRunning?.();
        } else if (isPaused) {
          if (onResume) onResume();
          else onStartNow?.();
        } else if (onDoneToggle) {
          onDoneToggle();
        }
      }}
      activeOpacity={0.8}
    >
      {/* Top Header: Title & Status Badge */}
      <View style={styles.topRow}>
        <View style={styles.titleArea}>
          <Text style={[styles.title, (isCompleted || isSkipped) && styles.titleFaded]} numberOfLines={1}>
            {taskData.title}
          </Text>
          <View style={styles.metaRow}>
            {taskData.category && (
              <Text style={styles.categoryText}>{taskData.category}</Text>
            )}
            {taskData.category && <Text style={styles.dotSeparator}>•</Text>}
            <View style={[styles.priorityBadge, { backgroundColor: priorityInfo.bg }]}>
              <Text style={[styles.priorityText, { color: priorityInfo.color }]}>
                {priorityInfo.label}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
          <Ionicons name={statusBadge.icon} size={13} color={statusBadge.color} />
          <Text style={[styles.statusText, { color: statusBadge.color }]}>
            {statusBadge.label}
          </Text>
        </View>
      </View>

      {/* Description if present */}
      {taskData.description ? (
        <Text style={styles.descriptionText} numberOfLines={2}>
          {taskData.description}
        </Text>
      ) : null}

      {/* Timing Row */}
      <View style={styles.timingSection}>
        {isCompleted ? (
          <View style={styles.completedTimingRow}>
            <View style={styles.timeSpanRow}>
              <Ionicons name="checkmark-circle" size={15} color={Colors.done} />
              <Text style={styles.completedTimeText}>
                Planned: {taskData.plannedMinutes ?? 30} min
              </Text>
            </View>
            <Text style={styles.actualTimeText}>
              Actual: {formatDuration(actualTimeSpentMs)}
            </Text>
          </View>
        ) : isRunning || isPaused ? (
          <View style={styles.completedTimingRow}>
            <View style={styles.timeSpanRow}>
              <Ionicons
                name={isRunning ? 'play' : 'pause'}
                size={14}
                color={isRunning ? Colors.done : Colors.accentPrimary}
              />
              <Text style={styles.timeSpanText}>
                Worked: {formatDuration(actualTimeSpentMs)}
              </Text>
            </View>
            <Text style={styles.durationRecurrenceText}>
              Planned: {taskData.plannedMinutes ?? 30} min
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.timeSpanRow}>
              <Ionicons name="time-outline" size={15} color={Colors.accentPrimary} />
              <Text style={styles.timeSpanText}>
                {startTimeStr} → {endTimeStr}
              </Text>
            </View>
            <Text style={styles.durationRecurrenceText}>
              {taskData.plannedMinutes ?? 30} min • {recurrenceText}
            </Text>
          </>
        )}
      </View>

      {/* Action Controls */}
      <View style={styles.actionsRow}>
        {isRunning ? (
          <TouchableOpacity
            style={[styles.btnAction, styles.btnRunning]}
            onPress={(e) => {
              e.stopPropagation();
              onOpenRunning?.();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="timer" size={15} color="#FFFFFF" />
            <Text style={styles.btnActionText}>View Timer</Text>
          </TouchableOpacity>
        ) : isPaused ? (
          <TouchableOpacity
            style={[styles.btnAction, styles.btnResume]}
            onPress={(e) => {
              e.stopPropagation();
              if (onResume) {
                onResume();
              } else if (onStartNow) {
                onStartNow();
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="play" size={15} color="#FFFFFF" />
            <Text style={styles.btnActionText}>Resume</Text>
          </TouchableOpacity>
        ) : isCompleted ? (
          <TouchableOpacity
            style={[styles.btnAction, styles.btnCompleted]}
            onPress={(e) => {
              e.stopPropagation();
              onDoneToggle?.();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark" size={15} color={Colors.done} />
            <Text style={[styles.btnActionText, { color: Colors.done }]}>Done (Tap to undo)</Text>
          </TouchableOpacity>
        ) : isSkipped ? (
          <TouchableOpacity
            style={[styles.btnAction, styles.btnSkipped]}
            onPress={(e) => {
              e.stopPropagation();
              onDoneToggle?.();
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={15} color={Colors.textSecondary} />
            <Text style={[styles.btnActionText, { color: Colors.textSecondary }]}>Undo Skip</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.btnAction, styles.btnStart]}
              onPress={(e) => {
                e.stopPropagation();
                onStartNow?.();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="play" size={14} color="#FFFFFF" />
              <Text style={styles.btnActionText}>Start Now</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnAction, styles.btnDoneCheck]}
              onPress={(e) => {
                e.stopPropagation();
                onDoneToggle?.();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark" size={14} color={Colors.done} />
              <Text style={[styles.btnActionText, { color: Colors.done }]}>Mark Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btnAction, styles.btnSkip]}
              onPress={(e) => {
                e.stopPropagation();
                onSkip?.();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-forward" size={14} color={Colors.textTertiary} />
              <Text style={[styles.btnActionText, { color: Colors.textTertiary }]}>Skip</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111118',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#1E1E2C',
    ...Shadow.sm,
  },
  cardRunning: {
    borderColor: Colors.accentPrimary,
    backgroundColor: '#141224',
  },
  cardStarting: {
    borderColor: Colors.accentPrimary,
    backgroundColor: '#16132A',
  },
  cardCompleted: {
    borderColor: '#172B23',
    backgroundColor: '#0C1410',
    opacity: 0.85,
  },
  cardSkipped: {
    borderColor: '#1E1B26',
    backgroundColor: '#0F0D14',
    opacity: 0.65,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  titleArea: {
    flex: 1,
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  titleFaded: {
    textDecorationLine: 'line-through',
    color: Colors.textTertiary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  categoryText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  dotSeparator: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  priorityBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: BorderRadius.sm,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
  descriptionText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    lineHeight: 18,
  },
  timingSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#1A1A26',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeSpanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timeSpanText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  durationRecurrenceText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  completedTimingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  completedTimeText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  actualTimeText: {
    fontSize: FontSize.xs,
    color: Colors.done,
    fontWeight: FontWeight.bold,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  btnAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    gap: 5,
  },
  btnStart: {
    backgroundColor: Colors.accentPrimary,
    flex: 1.2,
  },
  btnDoneCheck: {
    backgroundColor: 'rgba(0, 208, 156, 0.12)',
    flex: 1.2,
  },
  btnSkip: {
    backgroundColor: Colors.surfaceElevated,
    flex: 0.8,
  },
  btnRunning: {
    backgroundColor: Colors.accentPrimary,
    flex: 1,
  },
  btnResume: {
    backgroundColor: Colors.accentPrimary,
    flex: 1,
  },
  btnCompleted: {
    backgroundColor: 'rgba(0, 208, 156, 0.1)',
    flex: 1,
  },
  btnSkipped: {
    backgroundColor: Colors.surfaceElevated,
    flex: 1,
  },
  btnActionText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
});
