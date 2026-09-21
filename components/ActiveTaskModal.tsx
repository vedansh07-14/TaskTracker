import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTaskExecutionStore } from '@/store/taskExecutionStore';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '@/constants/theme';

function formatTimer(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDurationDetailed(seconds: number): string {
  if (seconds <= 0) return '0 sec';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} sec`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

function formatDurationMinutes(seconds: number): string {
  const m = Math.ceil(Math.max(0, seconds) / 60);
  return `${m} min`;
}

export function ActiveTaskModal() {
  const {
    activeTask,
    activeOccurrence,
    executionState,
    autoStartCountdown,
    remainingSeconds,
    actualSeconds,
    totalDurationSeconds,
    showStartingModal,
    showCompletedModal,
    isMuted,
    toggleMute,
    startTaskNow,
    pauseTask,
    resumeTask,
    finishTask,
    skipTask,
    dismissStartingModal,
    dismissCompletedModal,
    closeActiveModal,
  } = useTaskExecutionStore();

  const isVisible =
    (executionState === 'starting' && showStartingModal) ||
    executionState === 'running' ||
    (executionState === 'completed' && showCompletedModal);

  if (!isVisible || !activeTask) return null;

  const progress =
    totalDurationSeconds > 0
      ? Math.min(1, Math.max(0, actualSeconds / totalDurationSeconds))
      : 0;

  const startedTimeStr = activeOccurrence?.actualStartTime
    ? format(new Date(activeOccurrence.actualStartTime), 'hh:mm a')
    : activeOccurrence?.scheduledStart
    ? format(new Date(activeOccurrence.scheduledStart), 'hh:mm a')
    : '--:--';

  const plannedEndMs =
    (activeOccurrence?.actualStartTime ?? activeOccurrence?.scheduledStart ?? Date.now()) +
    (activeTask.plannedMinutes ?? 30) * 60 * 1000;
  const endsTimeStr = format(new Date(plannedEndMs), 'hh:mm a');

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* ─── 1. TASK STARTING POPUP (30-sec Auto-Start) ─── */}
        {executionState === 'starting' && showStartingModal && (
          <View style={styles.card}>
            <View style={styles.headerBadge}>
              <Ionicons name="notifications-outline" size={20} color={Colors.accentPrimary} />
              <Text style={styles.badgeText}>TASK STARTING</Text>
            </View>

            <Text style={styles.taskTitle}>{activeTask.title}</Text>
            {activeTask.category && (
              <Text style={styles.categoryText}>
                {activeTask.category} • {activeTask.priority?.toUpperCase() ?? 'MEDIUM'} PRIORITY
              </Text>
            )}

            <View style={styles.durationChip}>
              <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.durationText}>{activeTask.plannedMinutes ?? 30} minutes planned</Text>
            </View>

            <Text style={styles.noticeText}>Task starts now.</Text>

            {/* Countdown Badge */}
            <View style={styles.countdownBox}>
              <Ionicons name="timer-outline" size={18} color={Colors.accentPrimary} />
              <Text style={styles.countdownText}>
                Auto-starting in {autoStartCountdown}s
              </Text>
            </View>

            {/* Controls */}
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => startTaskNow()}
                activeOpacity={0.8}
              >
                <Ionicons name="play" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>Start Now</Text>
              </TouchableOpacity>

              <View style={styles.secondaryBtnRow}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={async () => {
                    await pauseTask();
                    dismissStartingModal();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="pause-outline" size={16} color={Colors.textPrimary} />
                  <Text style={styles.secondaryBtnText}>Pause</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryBtn, styles.dangerBtn]}
                  onPress={() => skipTask()}
                  activeOpacity={0.7}
                >
                  <Ionicons name="arrow-forward" size={16} color={Colors.missed} />
                  <Text style={[styles.secondaryBtnText, { color: Colors.missed }]}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ─── 2. RUNNING TASK MODAL ─── */}
        {executionState === 'running' && (
          <View style={styles.card}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusTag, styles.tagRunning]}>
                <View style={[styles.tagDot, { backgroundColor: Colors.done }]} />
                <Text style={[styles.tagText, { color: Colors.done }]}>RUNNING</Text>
              </View>

              <View style={styles.headerControlsRow}>
                <TouchableOpacity
                  onPress={toggleMute}
                  style={styles.iconBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={isMuted ? 'volume-mute-outline' : 'volume-high-outline'}
                    size={20}
                    color={Colors.textTertiary}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={closeActiveModal}
                  style={styles.iconBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={Colors.textTertiary} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.taskTitle}>{activeTask.title}</Text>
            {activeTask.description ? (
              <Text style={styles.descriptionText} numberOfLines={2}>
                {activeTask.description}
              </Text>
            ) : null}

            {/* Live timer display */}
            <View style={styles.timerDisplay}>
              <Text style={styles.timerDigits}>{formatTimer(remainingSeconds)}</Text>
              <Text style={styles.timerSub}>remaining ({formatDurationDetailed(actualSeconds)} worked)</Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.round(progress * 100)}%`,
                      backgroundColor: Colors.accentPrimary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.progressPercent}>{Math.round(progress * 100)}%</Text>
            </View>

            {/* Timing Range Info */}
            <View style={styles.timeInfoGrid}>
              <View style={styles.timeInfoItem}>
                <Text style={styles.timeInfoLabel}>STARTED</Text>
                <Text style={styles.timeInfoVal}>{startedTimeStr}</Text>
              </View>
              <View style={styles.timeInfoDivider} />
              <View style={styles.timeInfoItem}>
                <Text style={styles.timeInfoLabel}>ENDS</Text>
                <Text style={styles.timeInfoVal}>{endsTimeStr}</Text>
              </View>
            </View>

            {/* Controls */}
            <View style={styles.runningControlsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.pauseBtn]}
                onPress={() => pauseTask()}
                activeOpacity={0.8}
              >
                <Ionicons name="pause" size={18} color={Colors.textPrimary} />
                <Text style={styles.actionBtnText}>Pause</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.finishBtn]}
                onPress={() => finishTask()}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-done" size={18} color="#FFFFFF" />
                <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>Finish</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}



        {/* ─── 4. TASK COMPLETED MODAL ─── */}
        {executionState === 'completed' && showCompletedModal && (
          <View style={styles.card}>
            <View style={styles.completeIconCircle}>
              <Ionicons name="checkmark" size={38} color={Colors.done} />
            </View>

            <Text style={styles.completeTitle}>TASK COMPLETED ✓</Text>
            <Text style={styles.taskTitle}>{activeTask.title}</Text>
            
            <View style={styles.completedTimeCard}>
              <Text style={styles.completeStatText}>
                Planned: {activeTask.plannedMinutes ?? 30} min
              </Text>
              <Text style={styles.completeStatDivider}>•</Text>
              <Text style={[styles.completeStatText, { color: Colors.done, fontWeight: 'bold' }]}>
                Actual: {formatDurationDetailed(actualSeconds)}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: Spacing.xl }]}
              onPress={dismissCompletedModal}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#111118',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: '#242436',
    alignItems: 'center',
    ...Shadow.lg,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A182E',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    gap: 8,
    marginBottom: Spacing.md,
  },
  badgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.accentPrimary,
    letterSpacing: 1.5,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: Spacing.md,
  },
  headerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  tagRunning: {
    backgroundColor: 'rgba(0, 208, 156, 0.15)',
  },
  tagPaused: {
    backgroundColor: 'rgba(108, 92, 231, 0.18)',
  },
  tagDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  tagText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  iconBtn: {
    padding: 6,
  },
  taskTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginTop: 4,
  },
  descriptionText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: Spacing.md,
  },
  categoryText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  durationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    gap: 6,
    marginTop: Spacing.md,
  },
  durationText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  noticeText: {
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    fontWeight: FontWeight.medium,
    marginTop: Spacing.lg,
  },
  countdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1B38',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: BorderRadius.lg,
    gap: 8,
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: '#383363',
  },
  countdownText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.accentPrimary,
    fontVariant: ['tabular-nums'],
  },
  buttonGroup: {
    width: '100%',
    gap: Spacing.md,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentPrimary,
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    gap: 8,
    width: '100%',
  },
  primaryBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  secondaryBtnRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    gap: 6,
  },
  dangerBtn: {
    backgroundColor: 'rgba(255, 71, 87, 0.1)',
  },
  secondaryBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  timerDisplay: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  timerDigits: {
    fontSize: 50,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  timerSub: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  pausedStatsBox: {
    alignItems: 'center',
    backgroundColor: '#141224',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#2A244E',
    width: '100%',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    gap: 4,
  },
  pausedStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pausedWorkedText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  pausedRemainingText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  progressContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercent: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
    width: 34,
    textAlign: 'right',
  },
  timeInfoGrid: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#0C0C12',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginVertical: Spacing.md,
  },
  timeInfoItem: {
    flex: 1,
    alignItems: 'center',
  },
  timeInfoDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  timeInfoLabel: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  timeInfoVal: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  runningControlsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    width: '100%',
    marginTop: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    gap: 8,
  },
  pauseBtn: {
    backgroundColor: Colors.surfaceElevated,
  },
  resumeBtn: {
    backgroundColor: Colors.accentPrimary,
  },
  finishBtn: {
    backgroundColor: Colors.done,
  },
  actionBtnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  completeIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 208, 156, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  completeTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.heavy,
    color: Colors.done,
    letterSpacing: 1.5,
    marginBottom: Spacing.xs,
  },
  completedTimeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
    gap: 8,
    marginTop: Spacing.md,
  },
  completeStatText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  completeStatDivider: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
});
