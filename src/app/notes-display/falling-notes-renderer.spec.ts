import { noteRect, PIXELS_PER_MS, prepareNotes, visibleNoteRange } from './falling-notes-renderer';

describe('falling notes renderer', () => {
  const lane = { x: 80, width: 40, black: false };

  it('drops notes that cannot be drawn and sorts the rest by time', () => {
    const { notes, maxDurationMs } = prepareNotes([
      { midi: 64, name: 'E4', time: 2, duration: 0.5 },
      { midi: 60, name: 'C4', time: 0.5, duration: 1.5 },
      { midi: 62, name: 'D4', time: 1, duration: 0 },
      { midi: 61, name: 'C#4', time: 0.5, duration: 0.25 },
    ]);

    expect(notes.map(note => note.midi)).toEqual([60, 61, 64]);
    expect(notes[0].startMs).toBe(500);
    expect(notes[0].endMs).toBe(2000);
    expect(notes[0].fill).toBe('hsl(0, 78%, 54%)');
    expect(notes[1].fill).toBe('hsl(30, 78%, 54%)');
    expect(maxDurationMs).toBe(1500);
  });

  it('lands the note on the keyboard line when playback reaches it', () => {
    const rect = noteRect({ startMs: 2000, endMs: 2800 }, 2000, 500, lane);

    expect(rect.x).toBe(80);
    expect(rect.width).toBe(40);
    expect(rect.height).toBeCloseTo(800 * PIXELS_PER_MS);
    expect(rect.y + rect.height).toBeCloseTo(500);
  });

  it('moves the note down as playback advances', () => {
    const note = { startMs: 2000, endMs: 3000 };
    const before = noteRect(note, 2000, 400, lane);
    const after = noteRect(note, 2200, 400, lane);

    expect(after.y - before.y).toBeCloseTo(200 * PIXELS_PER_MS);
  });

  it('keeps only notes that can still be on screen', () => {
    const { notes, maxDurationMs } = prepareNotes([
      { midi: 60, name: 'C4', time: 0, duration: 1 },
      { midi: 62, name: 'D4', time: 1, duration: 1 },
      { midi: 64, name: 'E4', time: 2.5, duration: 1 },
      { midi: 65, name: 'F4', time: 5, duration: 1 },
    ]);

    const range = visibleNoteRange(notes, 2000, 500, maxDurationMs);

    expect(notes.slice(range.start, range.end).map(note => note.midi)).toEqual([62, 64]);
  });

  it('keeps a long note that started before the lookahead window', () => {
    const { notes, maxDurationMs } = prepareNotes([
      { midi: 60, name: 'C4', time: 0, duration: 5 },
      { midi: 64, name: 'E4', time: 8, duration: 1 },
    ]);

    const range = visibleNoteRange(notes, 4000, 500, maxDurationMs);

    expect(notes.slice(range.start, range.end).map(note => note.midi)).toEqual([60]);
  });
});
