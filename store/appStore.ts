import { create } from 'zustand';
import { format } from 'date-fns';

interface AppState {
  // Current selected date for the Today view
  selectedDate: string; // 'YYYY-MM-DD'

  // Timer state
  activeTimerOccurrenceId: string | null;
  timerStartedAt: number | null; // unix ms

  // Bootstrap state
  isReady: boolean;
  bootstrapError: string | null;

  // Actions
  setSelectedDate: (date: string) => void;
  startTimer: (occurrenceId: string) => void;
  stopTimer: () => { occurrenceId: string; startedAt: number } | null;
  setReady: (ready: boolean) => void;
  setBootstrapError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  selectedDate: format(new Date(), 'yyyy-MM-dd'),
  activeTimerOccurrenceId: null,
  timerStartedAt: null,
  isReady: false,
  bootstrapError: null,

  setSelectedDate: (date) => set({ selectedDate: date }),

  startTimer: (occurrenceId) =>
    set({
      activeTimerOccurrenceId: occurrenceId,
      timerStartedAt: Date.now(),
    }),

  stopTimer: () => {
    const state = get();
    if (!state.activeTimerOccurrenceId || !state.timerStartedAt) return null;

    const result = {
      occurrenceId: state.activeTimerOccurrenceId,
      startedAt: state.timerStartedAt,
    };

    set({
      activeTimerOccurrenceId: null,
      timerStartedAt: null,
    });

    return result;
  },

  setReady: (ready) => set({ isReady: ready }),
  setBootstrapError: (error) => set({ bootstrapError: error }),
}));
