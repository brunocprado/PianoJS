import { Component, ElementRef, OnDestroy, signal, viewChild } from '@angular/core';
import { PianoService } from '../shared/services/piano-service';
import { Note } from '@tonejs/midi/dist/Note';

@Component({
    selector: 'app-notes-display',
    templateUrl: './notes-display.component.html',
    styleUrls: ['./notes-display.component.css'],
})
export class NotesDisplayComponent implements OnDestroy {

  private readonly rootEl = viewChild.required<ElementRef<HTMLDivElement>>('root');

  private gcIntervalId: number | null = null;

  readonly whiteKeyW = signal(60); 
  readonly blackKeyW = signal(34);
  readonly notes = signal<Note[]>([]);
  readonly posX = signal<Record<string, number>>({});
  
  constructor(readonly piano: PianoService) { }

  private parsePx(value: string | null | undefined): number | null {
    if (!value) return null;
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }

  private getSemitone(noteName: string): number {
    const name = noteName.replace(/[0-9]/g, '');
    const map: Record<string, number> = {
      C: 0, 'C#': 1, Db: 1,
      D: 2, 'D#': 3, Eb: 3,
      E: 4,
      F: 5, 'F#': 6, Gb: 6,
      G: 7, 'G#': 8, Ab: 8,
      A: 9, 'A#': 10, Bb: 10,
      B: 11,
    };
    return map[name] ?? 0;
  }

  getNoteColor(noteName: string): string {
    const semitone = this.getSemitone(noteName);
    const hue = (semitone * 30) % 360;
    return `hsl(${hue} 70% 55%)`;
  }

  getKeyWidth(noteName: string): number {
    return noteName.includes('#') ? this.blackKeyW() : this.whiteKeyW();
  }

  getLeft(noteName: string): number {
    return this.posX()[noteName] ?? -9999;
  }

  teste(notes : Note[]){
    this.notes.set(notes);

    const rootLeft = this.rootEl().nativeElement.getBoundingClientRect().left;
    const pianoContainer = document.querySelector('#pianoContainer') as HTMLElement | null;

    if (pianoContainer) {
      const css = getComputedStyle(pianoContainer);
      this.whiteKeyW.set(this.parsePx(css.getPropertyValue('--white-w')) ?? this.whiteKeyW());
      this.blackKeyW.set(this.parsePx(css.getPropertyValue('--black-w')) ?? this.blackKeyW());
    }

    const positions: Record<string, number> = {};
    for (var i of this.piano.generateKeys()){
      var tmp = document.querySelector('#pianoContainer #' + i.note.replace("#", "b") + i.octave + '.containerKey')
      if(!tmp) continue
      positions[i.note + i.octave] = tmp.getBoundingClientRect().left - rootLeft
    }
    this.posX.set(positions);

    if (this.gcIntervalId !== null) {
      clearInterval(this.gcIntervalId);
    }
    this.gcIntervalId = window.setInterval(() => {
      this.notes.update(n => n.filter(i => (i.time * 1000) + i.duration * 1000 + 500 >= this.piano.curTime()));
    }, 250);
  }

  pause(){
    this.piano.playing.update(p => !p);
  }

  ngOnDestroy(): void {
    if (this.gcIntervalId !== null) {
      clearInterval(this.gcIntervalId);
    }
  }

}
