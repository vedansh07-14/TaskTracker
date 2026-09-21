import { Platform } from 'react-native';

/**
 * Cross-platform sound synthesis service using Web Audio API / AudioContext.
 * Zero external audio assets required — 100% reliable offline and in all environments.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web' && typeof window === 'undefined') return null;
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (e) {
    console.warn('AudioContext not available:', e);
    return null;
  }
}

/**
 * Play a noticeable, short, non-looping siren/alarm tone sequence when a task is starting.
 * Plays 3 alternating pulses (approx 2.4 seconds total) and stops automatically.
 */
export function playTaskStartSiren(muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    // Frequency alternation pattern (D5 -> A5 -> D5 -> A5 -> D5)
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.setValueAtTime(880.0, now + 0.3);
    osc.frequency.setValueAtTime(587.33, now + 0.6);
    osc.frequency.setValueAtTime(880.0, now + 0.9);
    osc.frequency.setValueAtTime(587.33, now + 1.2);
    osc.frequency.setValueAtTime(880.0, now + 1.5);
    osc.frequency.setValueAtTime(587.33, now + 1.8);
    osc.frequency.setValueAtTime(880.0, now + 2.1);

    // Gain envelope with smooth decay
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
    gain.gain.setValueAtTime(0.18, now + 2.2);
    gain.gain.linearRampToValueAtTime(0, now + 2.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 2.5);
  } catch (e) {
    console.warn('Failed to play task start siren:', e);
  }
}

/**
 * Play an uplifting, pleasant completion chime when a task finishes.
 */
export function playTaskCompletionChime(muted = false): void {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteTime = now + index * 0.12;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.2, noteTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.85);
    });
  } catch (e) {
    console.warn('Failed to play completion chime:', e);
  }
}
