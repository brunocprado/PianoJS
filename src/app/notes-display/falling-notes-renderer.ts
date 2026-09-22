/** Same fall speed as the old DOM layout: 1 ms of music = 0.5 px. */
export const PIXELS_PER_MS = 0.5;

export interface KeyLane {
  x: number;
  width: number;
  black: boolean;
}

export interface MidiNoteLike {
  midi: number;
  name: string;
  time: number;
  duration: number;
}

export interface DrawableNote {
  midi: number;
  name: string;
  startMs: number;
  endMs: number;
  fill: string;
}

export interface NoteRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SemitoneStyle {
  fill: string;
  top: string;
  deep: string;
  head: string;
}

const SEMITONE_STYLE: SemitoneStyle[] = Array.from({ length: 12 }, (_, semitone) => {
  const hue = semitone * 30;
  return {
    top: `hsl(${hue}, 92%, 70%)`,
    fill: `hsl(${hue}, 78%, 54%)`,
    deep: `hsl(${hue}, 72%, 40%)`,
    head: `hsl(${hue}, 90%, 64%)`,
  };
});

export function prepareNotes(notes: readonly MidiNoteLike[]): { notes: DrawableNote[]; maxDurationMs: number } {
  const prepared: DrawableNote[] = [];
  let maxDurationMs = 0;

  for (const note of notes) {
    if (!Number.isFinite(note.midi) || !Number.isFinite(note.time) || !Number.isFinite(note.duration)) continue;
    if (note.duration <= 0) continue;

    const startMs = note.time * 1000;
    const durationMs = note.duration * 1000;
    if (durationMs > maxDurationMs) maxDurationMs = durationMs;

    const semitone = ((note.midi % 12) + 12) % 12;
    prepared.push({
      midi: note.midi,
      name: note.name,
      startMs,
      endMs: startMs + durationMs,
      fill: SEMITONE_STYLE[semitone].fill,
    });
  }

  prepared.sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);
  return { notes: prepared, maxDurationMs };
}

export function visibleNoteRange(
  notes: readonly DrawableNote[],
  timeMs: number,
  viewHeight: number,
  maxDurationMs: number,
): { start: number; end: number } {
  if (!notes.length || viewHeight <= 0) return { start: 0, end: 0 };

  const earliest = timeMs - maxDurationMs;
  const latest = timeMs + viewHeight / PIXELS_PER_MS;
  return {
    start: lowerBound(notes, earliest),
    end: upperBound(notes, latest),
  };
}

export function noteRect(
  note: Pick<DrawableNote, 'startMs' | 'endMs'>,
  timeMs: number,
  viewHeight: number,
  lane: KeyLane,
): NoteRect {
  const height = (note.endMs - note.startMs) * PIXELS_PER_MS;
  const bottom = (note.startMs - timeMs) * PIXELS_PER_MS;
  return {
    x: lane.x,
    y: viewHeight - bottom - height,
    width: lane.width,
    height,
  };
}

function lowerBound(notes: readonly DrawableNote[], startMs: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].startMs < startMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(notes: readonly DrawableNote[], startMs: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid].startMs <= startMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class FallingNotesRenderer {
  private ctx: CanvasRenderingContext2D | null = null;
  private notes: DrawableNote[] = [];
  private maxDurationMs = 0;
  private lanes = new Map<number, KeyLane>();
  private width = 0;
  private height = 0;
  private keyboardMin = 0;
  private keyboardMax = 0;
  private showTracks = true;
  private readonly textWidths = new Map<string, number>();

  get ready(): boolean {
    return this.ctx !== null;
  }

  attach(canvas: HTMLCanvasElement): void {
    this.ctx = canvas.getContext('2d');
  }

  setNotes(notes: readonly MidiNoteLike[]): void {
    const prepared = prepareNotes(notes);
    this.notes = prepared.notes;
    this.maxDurationMs = prepared.maxDurationMs;
    this.textWidths.clear();
  }

  setShowTracks(showTracks: boolean): void {
    this.showTracks = showTracks;
  }

  setLanes(lanes: Map<number, KeyLane>): void {
    this.lanes = lanes;
    let min = Infinity;
    let max = -Infinity;
    for (const lane of lanes.values()) {
      min = Math.min(min, lane.x);
      max = Math.max(max, lane.x + lane.width);
    }
    this.keyboardMin = Number.isFinite(min) ? min : 0;
    this.keyboardMax = Number.isFinite(max) ? max : 0;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.width = cssWidth;
    this.height = cssHeight;
    const canvas = this.ctx?.canvas;
    if (!canvas || !this.ctx) return;

    const bitmapWidth = Math.max(1, Math.round(cssWidth * dpr));
    const bitmapHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
      canvas.width = bitmapWidth;
      canvas.height = bitmapHeight;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.textWidths.clear();
  }

  draw(timeMs: number): void {
    const ctx = this.ctx;
    if (!ctx || this.width <= 0 || this.height <= 0) return;

    ctx.clearRect(0, 0, this.width, this.height);
    if (!this.lanes.size) return;

    if (this.showTracks) this.drawHighway(ctx, timeMs);
    if (this.notes.length) this.drawNotes(ctx, timeMs);
    this.fadeIncoming(ctx);
    if (this.showTracks) this.drawHitLine(ctx);
  }

  private drawHighway(ctx: CanvasRenderingContext2D, timeMs: number): void {
    const left = this.keyboardMin;
    const width = this.keyboardMax - this.keyboardMin;
    const board = ctx.createLinearGradient(0, 0, 0, this.height);
    board.addColorStop(0, '#101218');
    board.addColorStop(0.55, '#171b24');
    board.addColorStop(1, '#222838');
    ctx.fillStyle = board;
    ctx.fillRect(left, 0, width, this.height);

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    for (const lane of this.lanes.values()) {
      if (!lane.black) continue;
      ctx.fillRect(lane.x, 0, lane.width, this.height);
    }

    ctx.lineWidth = 1;
    for (const [midi, lane] of this.lanes) {
      if (lane.black) continue;
      ctx.strokeStyle = midi % 12 === 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.moveTo(lane.x, 0);
      ctx.lineTo(lane.x, this.height);
      ctx.stroke();
    }

    const stepMs = 200;
    const lookBehind = this.height / PIXELS_PER_MS;
    let beat = Math.floor((timeMs - lookBehind) / stepMs) * stepMs;
    const horizon = timeMs + lookBehind;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (; beat <= horizon; beat += stepMs) {
      const y = this.height - (beat - timeMs) * PIXELS_PER_MS;
      if (y < -2 || y > this.height + 2) continue;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 146, 54, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, 0);
    ctx.lineTo(left, this.height);
    ctx.moveTo(this.keyboardMax, 0);
    ctx.lineTo(this.keyboardMax, this.height);
    ctx.stroke();
  }

  private drawNotes(ctx: CanvasRenderingContext2D, timeMs: number): void {
    const range = visibleNoteRange(this.notes, timeMs, this.height, this.maxDurationMs);
    ctx.font = '700 10px Inter, ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    for (const blackPass of [false, true]) {
      for (let i = range.start; i < range.end; i++) {
        const note = this.notes[i];
        if (note.endMs <= timeMs) continue;
        const lane = this.lanes.get(note.midi);
        if (!lane || lane.black !== blackPass) continue;
        this.paintNote(ctx, note, lane, timeMs);
      }
    }
  }

  private fadeIncoming(ctx: CanvasRenderingContext2D): void {
    const fadeHeight = Math.min(140, this.height * 0.28);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const fade = ctx.createLinearGradient(0, 0, 0, fadeHeight);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, this.width, fadeHeight);
    ctx.restore();
  }

  private drawHitLine(ctx: CanvasRenderingContext2D): void {
    const left = this.keyboardMin;
    const width = this.keyboardMax - this.keyboardMin;
    const y = this.height - 10;
    const wash = ctx.createLinearGradient(0, y, 0, this.height);
    wash.addColorStop(0, 'rgba(255,140,48,0)');
    wash.addColorStop(1, 'rgba(255,140,48,0.22)');
    ctx.fillStyle = wash;
    ctx.fillRect(left, y, width, 10);

    ctx.strokeStyle = 'rgba(255, 176, 74, 0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left, this.height - 1.5);
    ctx.lineTo(left + width, this.height - 1.5);
    ctx.stroke();
  }

  private paintNote(ctx: CanvasRenderingContext2D, note: DrawableNote, lane: KeyLane, timeMs: number): void {
    const rect = noteRect(note, timeMs, this.height, lane);
    if (rect.height < 0.5 || rect.y > this.height || rect.y + rect.height < 0) return;

    const pad = rect.width * (lane.black ? 0.08 : 0.12);
    const x = rect.x + pad;
    const y = rect.y;
    const w = Math.max(1, rect.width - pad * 2);
    const h = rect.height;
    const style = SEMITONE_STYLE[((note.midi % 12) + 12) % 12];
    const active = timeMs >= note.startMs && timeMs < note.endMs;
    const headH = Math.min(h, lane.black ? 16 : 20);
    const lipH = Math.min(5, headH * 0.34);
    const faceH = headH - lipH;
    const headTop = y + h - headH;
    const radius = Math.min(7, w / 2, h / 2);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [radius, radius, 1, 1]);
    ctx.clip();

    if (headTop - y > 0.5) {
      const body = ctx.createLinearGradient(0, y, 0, headTop);
      body.addColorStop(0, style.deep);
      body.addColorStop(1, style.fill);
      ctx.fillStyle = body;
      ctx.globalAlpha = active ? 0.92 : 0.78;
      ctx.fillRect(x, y, w, headTop - y);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = active ? style.top : style.head;
    ctx.fillRect(x, headTop, w, faceH);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x, headTop, w, Math.min(2, faceH));
    ctx.fillStyle = style.deep;
    ctx.fillRect(x, headTop + faceH, w, lipH);
    ctx.restore();

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [radius, radius, 1, 1]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    if (active) {
      ctx.fillStyle = style.fill;
      ctx.fillRect(x, this.height - 3, w, 3);
    }

    if (w < 26 || faceH < 11 || headTop + faceH > this.height - 2) return;
    let textWidth = this.textWidths.get(note.name);
    if (textWidth === undefined) {
      textWidth = ctx.measureText(note.name).width;
      this.textWidths.set(note.name, textWidth);
    }
    if (textWidth > w - 6) return;

    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillText(note.name, x + w / 2, headTop + faceH / 2);
  }
}
