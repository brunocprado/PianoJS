import {
  playbackRateForPitch,
  resolveNearestSampleMidi,
  sampleNameCandidates,
} from './sample-resolve';

describe('sampleNameCandidates', () => {
  it('lists sharp and flat names for black keys', () => {
    expect(sampleNameCandidates(30)).toEqual(['fs1', 'gb1']); // F#1 / Gb1
    expect(sampleNameCandidates(37)).toEqual(['cs2', 'db2']);
  });

  it('keeps naturals as a single name', () => {
    expect(sampleNameCandidates(24)).toEqual(['c1']);
    expect(sampleNameCandidates(36)).toEqual(['c2']);
  });
});

describe('resolveNearestSampleMidi', () => {
  it('returns the exact pitch when loaded', () => {
    expect(resolveNearestSampleMidi(36, [24, 36, 48])).toBe(36);
  });

  it('pitch-shifts from C2 when C1 is missing', () => {
    expect(resolveNearestSampleMidi(24, [36, 37, 48])).toBe(36);
    expect(playbackRateForPitch(24, 36)).toBeCloseTo(0.5);
  });

  it('returns null when nothing is within two octaves', () => {
    expect(resolveNearestSampleMidi(24, [60, 72])).toBeNull();
  });
});
