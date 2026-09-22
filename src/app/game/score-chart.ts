import { MidiNoteLike, prepareNotes } from '../notes-display/falling-notes-renderer';

/** Hit windows are a few frames wide so a 60fps clock can still land a perfect. */
export const WINDOWS_MS = {
  perfect: 50,
  great: 100,
  good: 150,
} as const;

export const POINTS = {
  perfect: 100,
  great: 75,
  good: 50,
  miss: 0,
} as const;

export const MAX_MULTIPLIER = 4;
export const COMBO_PER_MULTIPLIER = 10;

export type Judgment = 'perfect' | 'great' | 'good' | 'miss';
export type NoteMark = 'pending' | Judgment;

export interface NoteRange {
  min: number;
  max: number;
}

export interface ScoreSnapshot {
  score: number;
  combo: number;
  maxCombo: number;
  multiplier: number;
  counts: Record<Judgment, number>;
  total: number;
  resolved: number;
  accuracy: number;
  grade: string;
  last: Judgment | null;
}

export function multiplierFor(combo: number): number {
  if (combo <= 0) return 1;
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_PER_MULTIPLIER));
}

export function judgmentFor(deltaMs: number): Judgment {
  const delta = Math.abs(deltaMs);
  if (delta <= WINDOWS_MS.perfect) return 'perfect';
  if (delta <= WINDOWS_MS.great) return 'great';
  return 'good';
}

export function accuracyOf(counts: Record<Judgment, number>): number {
  const total = counts.perfect + counts.great + counts.good + counts.miss;
  if (!total) return 100;
  const weighted = counts.perfect + counts.great * 0.8 + counts.good * 0.5;
  return (weighted / total) * 100;
}

export function gradeFor(accuracy: number): string {
  if (accuracy >= 95) return 'S';
  if (accuracy >= 90) return 'A';
  if (accuracy >= 80) return 'B';
  if (accuracy >= 70) return 'C';
  if (accuracy >= 60) return 'D';
  return 'F';
}

export function emptyScore(): ScoreSnapshot {
  const counts = { perfect: 0, great: 0, good: 0, miss: 0 };
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    multiplier: 1,
    counts,
    total: 0,
    resolved: 0,
    accuracy: 100,
    grade: 'S',
    last: null,
  };
}

interface LiveNote {
  midi: number;
  startMs: number;
  scored: boolean;
  mark: NoteMark;
}

/**
 * Local chart for one player. Matching is by pitch and start time.
 * A later online session can share the same chart and snapshot.
 */
export class ScoreChart {
  private readonly notes: LiveNote[];
  private readonly markList: NoteMark[];
  private cursor = 0;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private last: Judgment | null = null;
  private readonly counts: Record<Judgment, number> = { perfect: 0, great: 0, good: 0, miss: 0 };

  readonly noteCount: number;
  readonly horizonMs: number;
  revision = 0;

  private constructor(notes: LiveNote[]) {
    this.notes = notes;
    this.markList = notes.map(() => 'pending');
    this.noteCount = notes.reduce((total, note) => total + (note.scored ? 1 : 0), 0);
    const lastStart = notes.reduce((max, note) => note.scored ? Math.max(max, note.startMs) : max, 0);
    this.horizonMs = lastStart + WINDOWS_MS.good + 80;
  }

  static create(notes: readonly MidiNoteLike[], range?: NoteRange): ScoreChart {
    const prepared = prepareNotes(notes).notes.map(note => ({
      midi: note.midi,
      startMs: note.startMs,
      scored: !range || (note.midi >= range.min && note.midi <= range.max),
      mark: 'pending' as const,
    }));
    return new ScoreChart(prepared);
  }

  marks(): readonly NoteMark[] {
    return this.markList;
  }

  snapshot(): ScoreSnapshot {
    const counts = { ...this.counts };
    const accuracy = accuracyOf(counts);
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: multiplierFor(this.combo),
      counts,
      total: this.noteCount,
      resolved: counts.perfect + counts.great + counts.good + counts.miss,
      accuracy,
      grade: gradeFor(accuracy),
      last: this.last,
    };
  }

  /** Returns a judgment when the press lands on a pending chart note. */
  press(midi: number, timeMs: number): Judgment | null {
    const latest = timeMs + WINDOWS_MS.good;
    let best = -1;
    let bestDelta = Infinity;

    for (let i = this.cursor; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.startMs > latest) break;
      if (!note.scored || note.mark !== 'pending' || note.midi !== midi) continue;
      const delta = Math.abs(note.startMs - timeMs);
      if (delta > WINDOWS_MS.good || delta >= bestDelta) continue;
      best = i;
      bestDelta = delta;
    }

    if (best < 0) return null;
    const judgment = judgmentFor(bestDelta);
    this.apply(best, judgment);
    return judgment;
  }

  /** Misses any scored note whose hit window has closed. */
  advance(timeMs: number): void {
    const expireBefore = timeMs - WINDOWS_MS.good;
    while (this.cursor < this.notes.length) {
      const note = this.notes[this.cursor];
      if (!note.scored) {
        this.cursor++;
        continue;
      }
      if (note.startMs >= expireBefore) break;
      if (note.mark === 'pending') this.apply(this.cursor, 'miss');
      this.cursor++;
    }
  }

  private apply(index: number, judgment: Judgment): void {
    const note = this.notes[index];
    note.mark = judgment;
    this.markList[index] = judgment;
    this.counts[judgment]++;
    this.last = judgment;
    this.revision++;

    if (judgment === 'miss') {
      this.combo = 0;
      return;
    }

    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.score += POINTS[judgment] * multiplierFor(this.combo);
  }
}
