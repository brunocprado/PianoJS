/** Sharp → flat aliases used by packs like neatonk/Iowa (med_gb1 instead of med_fs1). */
const FLAT_ALIASES: Record<string, string> = {
  cs: 'db',
  ds: 'eb',
  fs: 'gb',
  gs: 'ab',
  as: 'bb',
};

export function midiToSampleBaseName(midiNote: number): string {
  const notes = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${notes[((midiNote % 12) + 12) % 12]}${octave}`.toLowerCase();
}

export function sampleNameCandidates(midiNote: number): string[] {
  const sharp = midiToSampleBaseName(midiNote);
  const match = sharp.match(/^([a-g]s?)(-?\d+)$/);
  if (!match) return [sharp];
  const flat = FLAT_ALIASES[match[1]];
  return flat ? [sharp, `${flat}${match[2]}`] : [sharp];
}

export function resolveNearestSampleMidi(
  pitch: number,
  available: Iterable<number>,
  maxDistance = 24,
): number | null {
  let nearest: number | null = null;
  let best = Infinity;
  for (const midi of available) {
    const distance = Math.abs(midi - pitch);
    if (distance < best && distance <= maxDistance) {
      best = distance;
      nearest = midi;
    }
  }
  return nearest;
}

export function playbackRateForPitch(pitch: number, sampleMidi: number): number {
  return Math.pow(2, (pitch - sampleMidi) / 12);
}
