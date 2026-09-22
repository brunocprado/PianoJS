export class Settings {
  minNote: number = 36;
  maxNote: number = 96;
  useSamples: boolean = true;
  showTracks: boolean = true;

  constructor(min: number = 36, max: number = 96, useSamples: boolean = true, showTracks: boolean = true) {
    this.minNote = min;
    this.maxNote = max;
    this.useSamples = useSamples;
    this.showTracks = showTracks;
  }

  get minOctave(): number {
    return Math.floor(this.minNote / 12) - 1;
  }

  get octaveCount(): number {
    return Math.round((this.maxNote - this.minNote + 1) / 12);
  }

  static fromOctaves(minOctave: number, octaveCount: number, useSamples: boolean, showTracks: boolean = true): Settings {
    const start = Number(minOctave);
    const count = Number(octaveCount);
    const minNote = (start + 1) * 12;
    const maxNote = minNote + count * 12 - 1;
    return new Settings(minNote, maxNote, useSamples, showTracks);
  }
}
