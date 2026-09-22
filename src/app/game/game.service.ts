import { Injectable, inject, signal } from '@angular/core';
import { MidiNoteLike } from '../notes-display/falling-notes-renderer';
import { PianoService } from '../shared/services/piano-service';
import {
  NoteMark,
  ScoreChart,
  ScoreSnapshot,
  emptyScore,
} from './score-chart';

export type PlayMode = 'free' | 'score';
export type GamePhase = 'idle' | 'playing' | 'results' | 'unplayable';

/** Time before the first beat so the highway can scroll in. */
export const LEAD_IN_MS = 3000;

const NO_MARKS: readonly NoteMark[] = [];

@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly piano = inject(PianoService);

  readonly mode = signal<PlayMode>('free');
  readonly phase = signal<GamePhase>('idle');
  readonly state = signal<ScoreSnapshot>(emptyScore());

  private chart: ScoreChart | null = null;
  private source: readonly MidiNoteLike[] | null = null;
  private runId = 0;
  private unlisten: (() => void) | null = null;

  setMode(mode: PlayMode): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.abandon();
  }

  start(notes: readonly MidiNoteLike[]): void {
    const runId = ++this.runId;
    this.piano.stopPlayback();
    this.unbind();
    this.source = notes;

    const settings = this.piano.settings();
    const chart = ScoreChart.create(notes, { min: settings.minNote, max: settings.maxNote });
    this.chart = chart.noteCount ? chart : null;
    this.state.set(this.chart?.snapshot() ?? emptyScore());

    if (!this.chart) {
      this.phase.set(notes.length ? 'unplayable' : 'idle');
      return;
    }

    this.phase.set('playing');
    this.bind();
    void this.watch(runId, this.chart);
  }

  replay(): void {
    if (this.source) this.start(this.source);
  }

  /** Closes hit windows that the song clock has already passed. */
  sync(timeMs: number): void {
    const chart = this.chart;
    if (!chart || this.phase() !== 'playing') return;
    const before = chart.revision;
    chart.advance(timeMs);
    if (chart.revision !== before) this.publish();
  }

  marks(): readonly NoteMark[] {
    return this.chart?.marks() ?? NO_MARKS;
  }

  private async watch(runId: number, chart: ScoreChart): Promise<void> {
    const done = await this.piano.runClock(chart.horizonMs, LEAD_IN_MS);
    if (runId !== this.runId) return;
    this.unbind();
    if (!done) return;
    this.sync(this.piano.curTime());
    this.phase.set('results');
  }

  private bind(): void {
    this.unbind();
    this.unlisten = this.piano.onNoteOn((midi, timeMs) => {
      if (this.phase() !== 'playing' || !this.chart) return;
      if (!this.chart.press(midi, timeMs)) return;
      this.publish();
    });
  }

  private unbind(): void {
    this.unlisten?.();
    this.unlisten = null;
  }

  private publish(): void {
    if (!this.chart) return;
    this.state.set(this.chart.snapshot());
  }

  private abandon(): void {
    this.runId++;
    this.unbind();
    this.chart = null;
    this.phase.set('idle');
    this.state.set(emptyScore());
    this.piano.stopPlayback();
  }
}
