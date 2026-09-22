import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, signal, untracked, viewChild } from '@angular/core';
import { Button } from '@openng/optimus-ui/button';
import { Tag } from '@openng/optimus-ui/tag';
import { Toolbar } from '@openng/optimus-ui/toolbar';
import { Note } from '@tonejs/midi/dist/Note';
import { PianoService } from '../shared/services/piano-service';
import { LyricLine } from '../shared/models/lyric-line';
import { GameHudComponent } from '../game/game-hud.component';
import { GameService } from '../game/game.service';
import { FallingNotesRenderer, KeyLane } from './falling-notes-renderer';

@Component({
  selector: 'app-notes-display',
  templateUrl: './notes-display.component.html',
  styleUrl: './notes-display.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Toolbar, Button, Tag, GameHudComponent],
})
export class NotesDisplayComponent {

  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly renderer = new FallingNotesRenderer();

  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private pianoObserved = false;
  private rafId = 0;
  private dirty = true;
  private destroyed = false;
  private lastDrawnTime = Number.NaN;

  readonly lyrics = signal<LyricLine[]>([]);

  constructor(
    readonly piano: PianoService,
    private readonly game: GameService,
    destroyRef: DestroyRef,
  ) {
    effect(() => {
      const playing = this.piano.playing();
      untracked(() => {
        if (playing) this.requestFrame();
        else this.markDirty();
      });
    });

    effect(() => {
      const showTracks = this.piano.settings().showTracks;
      untracked(() => {
        this.renderer.setShowTracks(showTracks);
        this.markDirty();
      });
    });

    afterNextRender(() => {
      const canvas = this.canvasRef()?.nativeElement;
      const root = this.rootRef()?.nativeElement;
      if (!canvas || !root) return;
      this.renderer.attach(canvas);
      this.observeLayout(root);
      this.syncLayout();
    });

    destroyRef.onDestroy(() => this.teardown());
  }

  currentLyric(): string {
    const lines = this.lyrics();
    if (!lines.length) return '';
    const currentTime = this.piano.curTime() / 1000;
    let current = '';
    for (const line of lines) {
      if (line.time <= currentTime) current = line.text;
      else break;
    }
    return current;
  }

  loadNotes(notes: Note[], lyrics: LyricLine[] = []) {
    this.lyrics.set(lyrics);
    this.renderer.setNotes(notes);
    this.syncLayout();
    this.markDirty();
  }

  pause() {
    this.piano.playing.update(p => !p);
  }

  private frame = () => {
    this.rafId = 0;
    if (this.destroyed) return;

    const playing = this.piano.playing();
    if (!this.renderer.ready) {
      if (playing) this.requestFrame();
      return;
    }

    const time = this.piano.curTime();
    const scoring = this.game.mode() === 'score';
    this.renderer.setScoreMode(scoring);
    this.renderer.setMarks(this.game.marks());
    if (scoring) this.game.sync(time);
    if (this.dirty || time !== this.lastDrawnTime) {
      this.renderer.draw(time);
      this.lastDrawnTime = time;
      this.dirty = false;
    }
    if (playing) this.requestFrame();
  };

  private requestFrame() {
    if (this.destroyed || this.rafId) return;
    this.rafId = requestAnimationFrame(this.frame);
  }

  private markDirty() {
    this.dirty = true;
    this.requestFrame();
  }

  private observeLayout(root: HTMLElement) {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => this.syncLayout());
    this.resizeObserver.observe(root);
    this.ensurePianoObserver();
  }

  private ensurePianoObserver() {
    if (this.pianoObserved || !this.resizeObserver) return;
    const piano = document.getElementById('pianoContainer');
    if (!piano) return;
    this.resizeObserver.observe(piano);
    this.mutationObserver = new MutationObserver(() => this.syncLayout());
    this.mutationObserver.observe(piano, { childList: true });
    this.pianoObserved = true;
  }

  private syncLayout() {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas || this.destroyed) return;

    this.ensurePianoObserver();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width <= 0 || height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(width, height, dpr);
    this.renderer.setLanes(this.measureLanes(canvas, dpr));
    this.markDirty();
  }

  /** Reads the live key boxes so lanes follow centering, clamp widths, and black-key overlap. */
  private measureLanes(canvas: HTMLCanvasElement, dpr: number): Map<number, KeyLane> {
    const lanes = new Map<number, KeyLane>();
    const container = document.getElementById('pianoContainer');
    if (!container) return lanes;

    const origin = canvas.getBoundingClientRect().left;
    const snap = (value: number) => Math.round(value * dpr) / dpr;

    for (const el of container.querySelectorAll<HTMLElement>('[data-midi]')) {
      const midi = Number(el.dataset['midi']);
      if (!Number.isFinite(midi)) continue;
      const rect = el.getBoundingClientRect();
      lanes.set(midi, {
        x: snap(rect.left - origin),
        width: snap(rect.width),
        black: el.classList.contains('black'),
      });
    }
    return lanes;
  }

  private teardown() {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
  }
}
