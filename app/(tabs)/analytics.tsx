import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import {
  format,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfDay,
  eachDayOfInterval,
} from 'date-fns';
import { db } from '@/db/client';
import { occurrence, completionLog, task } from '@/db/schema';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';

type TimeRange = 'week' | 'month' | '30days';

interface DayStats {
  date: string;
  done: number;
  skipped: number;
  missed: number;
}

interface CategoryStats {
  category: string;
  count: number;
  color: string;
}

export default function AnalyticsScreen() {
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [dayStats, setDayStats] = useState<DayStats[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStats[]>([]);
  const [streak, setStreak] = useState(0);
  const [completionRate, setCompletionRate] = useState(0);
  const [totalDone, setTotalDone] = useState(0);
  const [totalOccurrences, setTotalOccurrences] = useState(0);

  const loadAnalytics = useCallback(async () => {
    const today = startOfDay(new Date());
    let startDate: Date;

    switch (timeRange) {
      case 'week':
        startDate = startOfWeek(today, { weekStartsOn: 1 });
        break;
      case 'month':
        startDate = subDays(today, 30);
        break;
      case '30days':
        startDate = subDays(today, 30);
        break;
      default:
        startDate = startOfWeek(today, { weekStartsOn: 1 });
    }

    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(today, 'yyyy-MM-dd');

    // Query all occurrences in range with their completions
    const results = await db
      .select({
        scheduledDate: occurrence.scheduledDate,
        status: completionLog.status,
        category: task.category,
      })
      .from(occurrence)
      .innerJoin(task, eq(task.id, occurrence.taskId))
      .leftJoin(completionLog, eq(completionLog.occurrenceId, occurrence.id))
      .where(
        and(
          gte(occurrence.scheduledDate, startStr),
          lte(occurrence.scheduledDate, endStr)
        )
      );

    // Build day stats
    const days = eachDayOfInterval({ start: startDate, end: today });
    const dayMap = new Map<string, DayStats>();
    for (const d of days) {
      const ds = format(d, 'yyyy-MM-dd');
      dayMap.set(ds, { date: ds, done: 0, skipped: 0, missed: 0 });
    }

    // Category stats
    const catMap = new Map<string, number>();

    let totalOcc = 0;
    let totalComp = 0;

    for (const r of results) {
      totalOcc++;
      const stat = dayMap.get(r.scheduledDate);
      if (stat && r.status) {
        if (r.status === 'done') {
          stat.done++;
          totalComp++;
        } else if (r.status === 'skipped') {
          stat.skipped++;
        } else if (r.status === 'missed') {
          stat.missed++;
        }
      }

      if (r.status === 'done' && r.category) {
        catMap.set(r.category, (catMap.get(r.category) ?? 0) + 1);
      }
    }

    setDayStats(Array.from(dayMap.values()));
    setTotalOccurrences(totalOcc);
    setTotalDone(totalComp);
    setCompletionRate(totalOcc > 0 ? Math.round((totalComp / totalOcc) * 100) : 0);

    // Category pie chart data
    const catColors = Colors.categoryColors;
    const catEntries: CategoryStats[] = Array.from(catMap.entries())
      .map(([category, count], i) => ({
        category,
        count,
        color: catColors[i % catColors.length],
      }))
      .sort((a, b) => b.count - a.count);
    setCategoryStats(catEntries);

    // Calculate streak (consecutive days with all tasks done)
    let currentStreak = 0;
    const sortedDays = Array.from(dayMap.values()).reverse();
    for (const day of sortedDays) {
      const total = day.done + day.skipped + day.missed;
      if (total === 0) continue;
      if (day.missed === 0 && day.done > 0) {
        currentStreak++;
      } else {
        break;
      }
    }
    setStreak(currentStreak);
  }, [timeRange]);

  useFocusEffect(
    useCallback(() => {
      loadAnalytics();
    }, [loadAnalytics])
  );

  // Prepare bar chart data
  const barData = useMemo(() => {
    const showDays = timeRange === 'week' ? dayStats : dayStats.slice(-14);
    return showDays.flatMap((day) => {
      const label = format(new Date(day.date + 'T00:00:00'), 'EEE');
      return [
        {
          value: day.done,
          label: label,
          spacing: 2,
          labelWidth: 30,
          labelTextStyle: { color: Colors.textTertiary, fontSize: 10 },
          frontColor: Colors.done,
        },
        {
          value: day.missed,
          frontColor: Colors.missed,
        },
      ];
    });
  }, [dayStats, timeRange]);

  // Prepare pie chart data
  const pieData = useMemo(() => {
    if (categoryStats.length === 0) return [];
    return categoryStats.map((cat) => ({
      value: cat.count,
      color: cat.color,
      text: cat.category,
      textColor: Colors.textPrimary,
      textSize: 10,
    }));
  }, [categoryStats]);

  const hasData = totalOccurrences > 0;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics</Text>
        </View>

        {/* Time range selector */}
        <View style={styles.rangeSelector}>
          {([
            ['week', 'This Week'],
            ['month', 'This Month'],
            ['30days', 'Last 30 Days'],
          ] as const).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.rangeBtn,
                timeRange === key && styles.rangeBtnActive,
              ]}
              onPress={() => setTimeRange(key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.rangeBtnText,
                  timeRange === key && styles.rangeBtnTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!hasData ? (
          <EmptyState
            icon="analytics-outline"
            title="No data yet"
            subtitle="Complete some tasks to see your analytics here."
          />
        ) : (
          <>
            {/* Stats cards */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{streak}</Text>
                <Text style={styles.statLabel}>Day Streak</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{completionRate}%</Text>
                <Text style={styles.statLabel}>Completion</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{totalDone}</Text>
                <Text style={styles.statLabel}>Tasks Done</Text>
              </View>
            </View>

            {/* Bar chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Daily Activity</Text>
              <Text style={styles.chartSubtitle}>
                Done (green) vs Missed (red)
              </Text>
              <View style={styles.chartContainer}>
                <BarChart
                  data={barData}
                  barWidth={12}
                  spacing={6}
                  roundedTop
                  roundedBottom
                  noOfSections={4}
                  yAxisThickness={0}
                  xAxisThickness={1}
                  xAxisColor={Colors.border}
                  yAxisTextStyle={{
                    color: Colors.textTertiary,
                    fontSize: 10,
                  }}
                  backgroundColor={Colors.surface}
                  isAnimated
                  animationDuration={600}
                  height={140}
                  width={280}
                />
              </View>
            </View>

            {/* Pie chart */}
            {categoryStats.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>By Category</Text>
                <Text style={styles.chartSubtitle}>
                  Completed tasks distribution
                </Text>
                <View style={styles.pieContainer}>
                  <PieChart
                    data={pieData}
                    donut
                    radius={80}
                    innerRadius={50}
                    innerCircleColor={Colors.surface}
                    centerLabelComponent={() => (
                      <View style={styles.pieCenter}>
                        <Text style={styles.pieCenterValue}>{totalDone}</Text>
                        <Text style={styles.pieCenterLabel}>done</Text>
                      </View>
                    )}
                  />
                  <View style={styles.pieLegend}>
                    {categoryStats.map((cat) => (
                      <View key={cat.category} style={styles.legendItem}>
                        <View
                          style={[
                            styles.legendDot,
                            { backgroundColor: cat.color },
                          ]}
                        />
                        <Text style={styles.legendText} numberOfLines={1}>
                          {cat.category}
                        </Text>
                        <Text style={styles.legendCount}>{cat.count}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  rangeSelector: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  rangeBtnActive: {
    backgroundColor: Colors.accentPrimary,
  },
  rangeBtnText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    color: Colors.textTertiary,
  },
  rangeBtnTextActive: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.semibold,
  },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  statValue: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    color: Colors.accentPrimary,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: FontWeight.medium,
  },
  chartCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    ...Shadow.sm,
  },
  chartTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  chartSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 2,
    marginBottom: Spacing.lg,
  },
  chartContainer: {
    alignItems: 'center',
    overflow: 'hidden',
  },
  pieContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
  },
  pieCenter: {
    alignItems: 'center',
  },
  pieCenterValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  pieCenterLabel: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  pieLegend: {
    flex: 1,
    gap: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  legendCount: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
});
