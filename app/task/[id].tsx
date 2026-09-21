import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { eq, and, gte } from 'drizzle-orm';
import { format, addMinutes, setHours, setMinutes } from 'date-fns';
import { db } from '@/db/client';
import { task, occurrence } from '@/db/schema';
import type { TaskPriority } from '@/db/schema';
import { generateUUID } from '@/lib/uuid';
import { generateOccurrencesForTask, generateOccurrences } from '@/lib/occurrences';
import { rescheduleForTask, cancelAllForTask } from '@/lib/notifications';
import { useTaskExecutionStore } from '@/store/taskExecutionStore';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '@/constants/theme';

const RECURRENCE_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'daily', label: 'Every day', desc: 'Runs 7 days a week' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)', desc: 'Monday through Friday' },
  { value: 'once', label: 'Once', desc: 'Only on scheduled date' },
  { value: 'weekly:custom', label: 'Custom weekly', desc: 'Specific days of the week' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DURATION_PRESETS = [15, 25, 30, 45, 60, 90];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, '0')
);
const MINUTE_OPTIONS = ['00', '05', '10', '15', '20', '30', '45', '50'];

const CATEGORY_SUGGESTIONS = [
  'Exercise',
  'Work',
  'Study',
  'Health',
  'Meditation',
  'Reading',
  'Creative',
  'Chores',
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string; bg: string }[] = [
  { value: 'low', label: 'Low', color: Colors.textTertiary, bg: 'rgba(140, 140, 160, 0.12)' },
  { value: 'medium', label: 'Medium', color: Colors.accentPrimary, bg: 'rgba(108, 92, 231, 0.15)' },
  { value: 'high', label: 'High', color: Colors.missed, bg: 'rgba(255, 71, 87, 0.15)' },
];

export default function TaskEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [plannedMinutes, setPlannedMinutes] = useState('30');
  const [recurrenceType, setRecurrenceType] = useState('daily');
  const [weeklyDays, setWeeklyDays] = useState<number[]>([1, 3, 5]);
  const [startHour, setStartHour] = useState(() => {
    const now = new Date();
    const next = addMinutes(now, 15);
    return format(next, 'HH');
  });
  const [startMinute, setStartMinute] = useState(() => {
    const now = new Date();
    const next = addMinutes(now, 15);
    const m = Math.ceil(next.getMinutes() / 5) * 5;
    return (m >= 60 ? 0 : m).toString().padStart(2, '0');
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoStartEnabled, setAutoStartEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load existing task data if editing
  useEffect(() => {
    if (!isNew && id) {
      (async () => {
        const [existing] = await db
          .select()
          .from(task)
          .where(eq(task.id, id));

        if (existing) {
          setTitle(existing.title);
          setDescription(existing.description ?? '');
          setCategory(existing.category ?? '');
          setPriority((existing.priority as TaskPriority) ?? 'medium');
          setPlannedMinutes(existing.plannedMinutes?.toString() ?? '30');
          setSoundEnabled(existing.soundEnabled === 1);
          setAutoStartEnabled(existing.autoStartEnabled === 1);

          if (existing.recurrenceRule) {
            if (existing.recurrenceRule.startsWith('weekly:')) {
              setRecurrenceType('weekly:custom');
              const days = existing.recurrenceRule
                .slice('weekly:'.length)
                .split(',')
                .map(Number);
              setWeeklyDays(days);
            } else {
              setRecurrenceType(existing.recurrenceRule);
            }
          }

          if (existing.defaultStartTime) {
            const [h, m] = existing.defaultStartTime.split(':');
            setStartHour(h?.padStart(2, '0') ?? '09');
            setStartMinute(m?.padStart(2, '0') ?? '30');
          }
        }
      })();
    }
  }, [id, isNew]);

  const toggleWeeklyDay = useCallback((day: number) => {
    setWeeklyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }, []);

  const getRecurrenceRule = useCallback((): string => {
    if (recurrenceType === 'weekly:custom') {
      if (weeklyDays.length === 0) return 'daily';
      return `weekly:${weeklyDays.join(',')}`;
    }
    return recurrenceType;
  }, [recurrenceType, weeklyDays]);

  // Dynamically calculate Starts At, Ends At, Duration
  const timingSummary = useMemo(() => {
    const durationNum = parseInt(plannedMinutes, 10) || 30;
    const baseDate = new Date();
    const h = parseInt(startHour, 10) || 9;
    const m = parseInt(startMinute, 10) || 0;

    const startDate = setMinutes(setHours(baseDate, h), m);
    const endDate = addMinutes(startDate, durationNum);

    return {
      startsAt: format(startDate, 'hh:mm a'),
      endsAt: format(endDate, 'hh:mm a'),
      durationText: `${durationNum} min`,
    };
  }, [startHour, startMinute, plannedMinutes]);

  // Recurrence summary text
  const recurrenceLabel = useMemo(() => {
    if (recurrenceType === 'daily') return 'Every day';
    if (recurrenceType === 'weekdays') return 'Weekdays (Mon–Fri)';
    if (recurrenceType === 'once') return 'Once';
    if (recurrenceType === 'weekly:custom') {
      return weeklyDays.map((d) => DAY_NAMES[d]).join(', ') || 'Every day';
    }
    return 'Every day';
  }, [recurrenceType, weeklyDays]);

  const handleGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      const msg = 'Please enter a task title.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Required', msg);
      return;
    }

    setSaving(true);

    try {
      const taskId = isNew ? generateUUID() : id!;
      const rule = getRecurrenceRule();
      const startTime = `${startHour.padStart(2, '0')}:${startMinute.padStart(2, '0')}`;
      const minutes = parseInt(plannedMinutes, 10) || 30;

      const taskData = {
        id: taskId,
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        priority: priority,
        plannedMinutes: minutes,
        recurrenceRule: rule,
        defaultStartTime: startTime,
        soundEnabled: soundEnabled ? 1 : 0,
        autoStartEnabled: autoStartEnabled ? 1 : 0,
        active: 1,
        createdAt: Date.now(),
      };

      if (isNew) {
        await db.insert(task).values(taskData);
      } else {
        await cancelAllForTask(taskId);

        // Delete future pending occurrences (keep past history)
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        await db
          .delete(occurrence)
          .where(
            and(
              eq(occurrence.taskId, taskId),
              gte(occurrence.scheduledDate, todayStr)
            )
          );

        await db
          .update(task)
          .set({
            title: taskData.title,
            description: taskData.description,
            category: taskData.category,
            priority: taskData.priority,
            plannedMinutes: taskData.plannedMinutes,
            recurrenceRule: taskData.recurrenceRule,
            defaultStartTime: taskData.defaultStartTime,
            soundEnabled: taskData.soundEnabled,
            autoStartEnabled: taskData.autoStartEnabled,
          })
          .where(eq(task.id, taskId));
      }

      // Generate occurrences for this task
      const [savedTask] = await db.select().from(task).where(eq(task.id, taskId));
      if (savedTask) {
        await generateOccurrencesForTask(savedTask);
        await generateOccurrences();
        await rescheduleForTask(taskId);
      }

      // Notify all screens of updated data
      useTaskExecutionStore.getState().incrementDataVersion();

      handleGoBack();
    } catch (error) {
      console.error('Save error:', error);
      const err = 'Failed to save task. Please try again.';
      if (Platform.OS === 'web') window.alert(err);
      else Alert.alert('Error', err);
    } finally {
      setSaving(false);
    }
  }, [
    isNew,
    id,
    title,
    description,
    category,
    priority,
    plannedMinutes,
    getRecurrenceRule,
    startHour,
    startMinute,
    soundEnabled,
    autoStartEnabled,
    handleGoBack,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleGoBack}
            style={styles.headerBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isNew ? 'New Task' : 'Edit Task'}
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ─── SECTION 1: TASK DETAILS ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>TASK DETAILS</Text>

            {/* Task Name */}
            <Text style={styles.label}>TASK NAME *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Morning Run"
              placeholderTextColor={Colors.textTertiary}
              returnKeyType="next"
            />

            {/* Description / Notes */}
            <Text style={styles.label}>DESCRIPTION / NOTES</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Optional details, checklists, or reminders..."
              placeholderTextColor={Colors.textTertiary}
              multiline
              numberOfLines={3}
            />

            {/* Category */}
            <Text style={styles.label}>CATEGORY</Text>
            <TextInput
              style={styles.input}
              value={category}
              onChangeText={setCategory}
              placeholder="e.g. Exercise"
              placeholderTextColor={Colors.textTertiary}
            />

            {/* Quick Category Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
            >
              {CATEGORY_SUGGESTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.chip,
                    category.toLowerCase() === cat.toLowerCase() && styles.chipActive,
                  ]}
                  onPress={() => setCategory(cat)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      category.toLowerCase() === cat.toLowerCase() && styles.chipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Priority */}
            <Text style={styles.label}>PRIORITY</Text>
            <View style={styles.priorityRow}>
              {PRIORITY_OPTIONS.map((opt) => {
                const isSelected = priority === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.priorityBtn,
                      isSelected && { borderColor: opt.color, backgroundColor: opt.bg },
                    ]}
                    onPress={() => setPriority(opt.value)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.priorityDot, { backgroundColor: opt.color }]} />
                    <Text
                      style={[
                        styles.priorityBtnText,
                        isSelected && { color: Colors.textPrimary, fontWeight: FontWeight.bold },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ─── SECTION 2: TIMING & AUTO-CALCULATED CARD ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>TIMING</Text>

            {/* Live Starts / Ends / Duration Display Card */}
            <View style={styles.timeSummaryCard}>
              <View style={styles.timeSummaryColumn}>
                <Text style={styles.timeSummarySub}>STARTS AT</Text>
                <Text style={styles.timeSummaryMain}>{timingSummary.startsAt}</Text>
              </View>
              <View style={styles.timeSummaryDivider} />
              <View style={styles.timeSummaryColumn}>
                <Text style={styles.timeSummarySub}>ENDS AT</Text>
                <Text style={styles.timeSummaryMain}>{timingSummary.endsAt}</Text>
              </View>
              <View style={styles.timeSummaryDivider} />
              <View style={styles.timeSummaryColumn}>
                <Text style={styles.timeSummarySub}>DURATION</Text>
                <Text style={[styles.timeSummaryMain, { color: Colors.accentPrimary }]}>
                  {timingSummary.durationText}
                </Text>
              </View>
            </View>

            {/* Duration Input & Presets */}
            <Text style={styles.label}>DURATION (MINUTES)</Text>
            <TextInput
              style={styles.input}
              value={plannedMinutes}
              onChangeText={(text) => setPlannedMinutes(text.replace(/[^0-9]/g, ''))}
              placeholder="30"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="number-pad"
            />
            <View style={styles.presetRow}>
              {DURATION_PRESETS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[
                    styles.presetBtn,
                    plannedMinutes === m.toString() && styles.presetBtnActive,
                  ]}
                  onPress={() => setPlannedMinutes(m.toString())}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.presetBtnText,
                      plannedMinutes === m.toString() && styles.presetBtnTextActive,
                    ]}
                  >
                    {m}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Start Time Selector */}
            <Text style={styles.label}>START TIME (24H / HH:MM)</Text>
            <View style={styles.timePickerContainer}>
              <View style={styles.timeCol}>
                <Text style={styles.timeColLabel}>Hour</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.timeOptionRow}
                >
                  {HOUR_OPTIONS.map((h) => (
                    <TouchableOpacity
                      key={h}
                      style={[
                        styles.timeOptionBtn,
                        startHour === h && styles.timeOptionBtnActive,
                      ]}
                      onPress={() => setStartHour(h)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.timeOptionText,
                          startHour === h && styles.timeOptionTextActive,
                        ]}
                      >
                        {h}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.timeCol}>
                <Text style={styles.timeColLabel}>Minute</Text>
                <View style={styles.timeOptionRow}>
                  {MINUTE_OPTIONS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.timeOptionBtn,
                        startMinute === m && styles.timeOptionBtnActive,
                      ]}
                      onPress={() => setStartMinute(m)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.timeOptionText,
                          startMinute === m && styles.timeOptionTextActive,
                        ]}
                      >
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>

          {/* ─── SECTION 3: RECURRENCE ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>RECURRENCE</Text>
            {RECURRENCE_OPTIONS.map((opt) => {
              const isSelected = recurrenceType === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.recurrenceOption,
                    isSelected && styles.recurrenceOptionActive,
                  ]}
                  onPress={() => setRecurrenceType(opt.value)}
                  activeOpacity={0.7}
                >
                  <View style={styles.recurrenceRadioArea}>
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && styles.radioCircleActive,
                      ]}
                    >
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.recurrenceTextArea}>
                      <Text
                        style={[
                          styles.recurrenceTitle,
                          isSelected && styles.recurrenceTitleActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={styles.recurrenceDesc}>{opt.desc}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Custom Day Selector */}
            {recurrenceType === 'weekly:custom' && (
              <View style={styles.customDaysContainer}>
                <Text style={styles.customDaysLabel}>SELECT ACTIVE DAYS</Text>
                <View style={styles.dayPickerRow}>
                  {DAY_NAMES.map((name, index) => {
                    const isSelected = weeklyDays.includes(index);
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[
                          styles.dayBtn,
                          isSelected && styles.dayBtnActive,
                        ]}
                        onPress={() => toggleWeeklyDay(index)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.dayBtnText,
                            isSelected && styles.dayBtnTextActive,
                          ]}
                        >
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* ─── SECTION 4: ALERTS & EXECUTION SETTINGS ─── */}
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>ALERTS & TIMING</Text>

            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingTitle}>Task-Start Sound</Text>
                <Text style={styles.settingDesc}>
                  Play alert sound when the task is scheduled to start
                </Text>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                trackColor={{ false: Colors.surfaceElevated, true: Colors.accentPrimary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={[styles.settingRow, { marginTop: Spacing.md }]}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingTitle}>Auto-Start after 30 Seconds</Text>
                <Text style={styles.settingDesc}>
                  Show popup and automatically start timer after 30s countdown
                </Text>
              </View>
              <Switch
                value={autoStartEnabled}
                onValueChange={setAutoStartEnabled}
                trackColor={{ false: Colors.surfaceElevated, true: Colors.accentPrimary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          {/* ─── SECTION 5: LIVE TASK PREVIEW ─── */}
          <View style={[styles.section, { marginBottom: Spacing.xxl }]}>
            <Text style={styles.sectionHeader}>TASK PREVIEW</Text>
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle} numberOfLines={1}>
                  {title.trim() || 'Untitled Task'}
                </Text>
                <View
                  style={[
                    styles.previewPriorityBadge,
                    {
                      backgroundColor:
                        priority === 'high'
                          ? 'rgba(255,71,87,0.15)'
                          : priority === 'low'
                          ? 'rgba(140,140,160,0.15)'
                          : 'rgba(108,92,231,0.15)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.previewPriorityText,
                      {
                        color:
                          priority === 'high'
                            ? Colors.missed
                            : priority === 'low'
                            ? Colors.textTertiary
                            : Colors.accentPrimary,
                      },
                    ]}
                  >
                    {priority.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.previewMeta}>
                {category.trim() || 'General'} • {priority.charAt(0).toUpperCase() + priority.slice(1)} Priority
              </Text>

              {description.trim() ? (
                <Text style={styles.previewDescription} numberOfLines={2}>
                  {description.trim()}
                </Text>
              ) : null}

              <View style={styles.previewTimingRow}>
                <View style={styles.previewTimeBadge}>
                  <Ionicons name="time-outline" size={14} color={Colors.accentPrimary} />
                  <Text style={styles.previewTimeText}>
                    {timingSummary.startsAt} → {timingSummary.endsAt}
                  </Text>
                </View>
                <Text style={styles.previewRecurrenceText}>
                  {timingSummary.durationText} • {recurrenceLabel}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A26',
    backgroundColor: Colors.background,
  },
  headerBtn: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  saveBtn: {
    backgroundColor: Colors.accentPrimary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.md,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: '#FFFFFF',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 60,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.heavy,
    color: Colors.accentPrimary,
    letterSpacing: 1.5,
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: 11,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: Spacing.sm,
  },
  input: {
    backgroundColor: '#111118',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: '#242436',
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  chipScroll: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: '#242436',
  },
  chipActive: {
    backgroundColor: Colors.accentPrimary,
    borderColor: Colors.accentPrimary,
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: 4,
  },
  priorityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: '#111118',
    borderWidth: 1,
    borderColor: '#242436',
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  timeSummaryCard: {
    flexDirection: 'row',
    backgroundColor: '#131124',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#2F2954',
  },
  timeSummaryColumn: {
    flex: 1,
    alignItems: 'center',
  },
  timeSummaryDivider: {
    width: 1,
    backgroundColor: '#2F2954',
  },
  timeSummarySub: {
    fontSize: 9,
    fontWeight: FontWeight.heavy,
    color: Colors.textTertiary,
    letterSpacing: 1,
  },
  timeSummaryMain: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 3,
    fontVariant: ['tabular-nums'],
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  presetBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: '#242436',
  },
  presetBtnActive: {
    backgroundColor: Colors.accentPrimary,
    borderColor: Colors.accentPrimary,
  },
  presetBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  presetBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  timePickerContainer: {
    marginTop: 4,
    gap: Spacing.md,
  },
  timeCol: {
    gap: 6,
  },
  timeColLabel: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  timeOptionRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  timeOptionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: BorderRadius.md,
    backgroundColor: '#111118',
    borderWidth: 1,
    borderColor: '#242436',
  },
  timeOptionBtnActive: {
    backgroundColor: Colors.accentPrimary,
    borderColor: Colors.accentPrimary,
  },
  timeOptionText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  timeOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  recurrenceOption: {
    backgroundColor: '#111118',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#242436',
  },
  recurrenceOptionActive: {
    borderColor: Colors.accentPrimary,
    backgroundColor: '#151328',
  },
  recurrenceRadioArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: Colors.accentPrimary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accentPrimary,
  },
  recurrenceTextArea: {
    flex: 1,
  },
  recurrenceTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  recurrenceTitleActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  recurrenceDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  customDaysContainer: {
    marginTop: Spacing.sm,
    backgroundColor: '#0E0E14',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: '#1E1E2C',
  },
  customDaysLabel: {
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    color: Colors.textTertiary,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  dayPickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  dayBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceElevated,
  },
  dayBtnActive: {
    backgroundColor: Colors.accentPrimary,
  },
  dayBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
  },
  dayBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: FontWeight.bold,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111118',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#242436',
  },
  settingTextCol: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  settingTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  settingDesc: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  previewCard: {
    backgroundColor: '#121122',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: '#302A54',
    ...Shadow.md,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    flex: 1,
  },
  previewPriorityBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.sm,
  },
  previewPriorityText: {
    fontSize: 10,
    fontWeight: FontWeight.heavy,
    letterSpacing: 0.5,
  },
  previewMeta: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  previewDescription: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  previewTimingRow: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#242042',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewTimeText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  previewRecurrenceText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
});
