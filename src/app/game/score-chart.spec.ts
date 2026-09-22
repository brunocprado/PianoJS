import { ScoreChart, accuracyOf, gradeFor, multiplierFor } from './score-chart';

function note(midi: number, time: number, duration = 0.4) {
  return { midi, name: 'C4', time, duration };
}

describe('score chart', () => {
  it('scores a perfect, great, and good by how close the press is', () => {
    const chart = ScoreChart.create([
      note(60, 1),
      note(62, 2),
      note(64, 3),
    ]);

    expect(chart.press(60, 1000)).toBe('perfect');
    expect(chart.press(62, 2080)).toBe('great');
    expect(chart.press(64, 3140)).toBe('good');

    const state = chart.snapshot();
    expect(state.score).toBe(100 + 75 + 50);
    expect(state.combo).toBe(3);
    expect(state.counts).toEqual({ perfect: 1, great: 1, good: 1, miss: 0 });
  });

  it('raises the multiplier every 10 hits and scores the threshold note at the new tier', () => {
    const chart = ScoreChart.create(Array.from({ length: 30 }, (_, i) => note(60, i)));

    for (let i = 0; i < 30; i++) {
      chart.press(60, i * 1000);
    }

    const state = chart.snapshot();
    expect(state.combo).toBe(30);
    expect(state.multiplier).toBe(4);
    expect(state.maxCombo).toBe(30);
    expect(state.score).toBe(100 * (9 + 20 + 30 + 4));
  });

  it('caps the multiplier at 4', () => {
    expect(multiplierFor(0)).toBe(1);
    expect(multiplierFor(9)).toBe(1);
    expect(multiplierFor(10)).toBe(2);
    expect(multiplierFor(29)).toBe(3);
    expect(multiplierFor(30)).toBe(4);
    expect(multiplierFor(80)).toBe(4);
  });

  it('misses a note once its window closes and resets the combo', () => {
    const chart = ScoreChart.create([note(60, 1), note(62, 2)]);
    chart.press(60, 1000);
    chart.advance(2000 + 151);

    const state = chart.snapshot();
    expect(state.counts.miss).toBe(1);
    expect(state.combo).toBe(0);
    expect(state.maxCombo).toBe(1);
    expect(state.score).toBe(100);
    expect(chart.marks()[1]).toBe('miss');
  });

  it('keeps the combo when the player hits a pitch that is not on the chart', () => {
    const chart = ScoreChart.create([note(60, 1)]);
    expect(chart.press(72, 1000)).toBeNull();
    expect(chart.press(60, 1000)).toBe('perfect');
    expect(chart.snapshot().combo).toBe(1);
  });

  it('matches each pitch of a chord and the closest repeated note', () => {
    const chart = ScoreChart.create([
      note(60, 1),
      note(64, 1),
      note(60, 1.12),
    ]);

    expect(chart.press(60, 1120)).toBe('perfect');
    expect(chart.press(64, 1000)).toBe('perfect');
    expect(chart.press(60, 1000)).toBe('perfect');
    expect(chart.snapshot().counts.perfect).toBe(3);
  });

  it('ignores notes outside the keyboard and still aligns marks with the drawn chart', () => {
    const chart = ScoreChart.create(
      [note(60, 1), note(108, 1.5)],
      { min: 36, max: 96 },
    );

    chart.advance(10_000);
    expect(chart.noteCount).toBe(1);
    expect(chart.snapshot().counts.miss).toBe(1);
    expect(chart.marks()).toEqual(['miss', 'pending']);
  });

  it('does not miss a note that is still inside the hit window', () => {
    const chart = ScoreChart.create([note(60, 1)]);
    chart.advance(1000 + 150);
    expect(chart.press(60, 1150)).toBe('good');
    expect(chart.snapshot().counts.miss).toBe(0);
  });

  it('grades weighted accuracy', () => {
    expect(accuracyOf({ perfect: 1, great: 0, good: 0, miss: 0 })).toBe(100);
    expect(accuracyOf({ perfect: 0, great: 1, good: 0, miss: 0 })).toBeCloseTo(80);
    expect(accuracyOf({ perfect: 0, great: 0, good: 0, miss: 1 })).toBe(0);
    expect(gradeFor(100)).toBe('S');
    expect(gradeFor(95)).toBe('S');
    expect(gradeFor(90)).toBe('A');
    expect(gradeFor(80)).toBe('B');
    expect(gradeFor(70)).toBe('C');
    expect(gradeFor(60)).toBe('D');
    expect(gradeFor(59.9)).toBe('F');
  });
});
