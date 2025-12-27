import { Component, ElementRef, ViewChild } from '@angular/core';
import { PianoService } from '../shared/services/piano-service';
import { Note } from '@tonejs/midi/dist/Note';

@Component({
    selector: 'app-notes-display',
    templateUrl: './notes-display.component.html',
    styleUrls: ['./notes-display.component.css'],
    standalone: false
})
export class NotesDisplayComponent {

  @ViewChild('root', { static: true }) rootEl!: ElementRef<HTMLDivElement>;

  private gcIntervalId: number | null = null; // GC

  // Key Widths - so i can "sync" the notes-display component with the keys in the footer
  whiteKeyW = 60; 
  blackKeyW = 34;

  time: number = 0
  notes : Note[] = []

  posX : { [v: string]: number } = {}
  
  constructor(private piano: PianoService) { }

  private parsePx(value: string | null | undefined): number | null {
    if (!value) return null;
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }

  // noteColors: { [v: string]: string } = {
  //   "C" : "red", 
  //   "C#" : "darkred", 
  //   "D" : "yellow", 
  //   "D#" : "gold", 
  //   "E" : "purple", 
  //   "F" : "lightblue",
  //   "F#" : "blue", 
  //   "G" : "lightgreen", 
  //   "G#" : "green",
  //   "A" : "pink", 
  //   "A#" : "crimson", 
  //   "B": "violet"
  // }

  // New notes color method instead of static colors
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

  // Changing the colors to a gradient using HSL
  getNoteColor(noteName: string): string {
    const semitone = this.getSemitone(noteName);
    const hue = (semitone * 30) % 360;
    return `hsl(${hue} 70% 55%)`;
  }

  getKeyWidth(noteName: string): number {
    return noteName.includes('#') ? this.blackKeyW : this.whiteKeyW;
  }

  getLeft(noteName: string): number {
    return this.posX[noteName] ?? -9999;
  }

  teste(notes : Note[]){
    this.notes = notes;

    const rootLeft = this.rootEl?.nativeElement?.getBoundingClientRect().left ?? 0;
    const pianoContainer = document.querySelector('#pianoContainer') as HTMLElement | null;

    if (pianoContainer) {
      const css = getComputedStyle(pianoContainer);
      this.whiteKeyW = this.parsePx(css.getPropertyValue('--white-w')) ?? this.whiteKeyW;
      this.blackKeyW = this.parsePx(css.getPropertyValue('--black-w')) ?? this.blackKeyW;
    }

    for (var i of this.piano.generateKeys()){
      var tmp = document.querySelector('#pianoContainer #' + i.note.replace("#", "b") + i.octave + '.containerKey')
      if(!tmp) continue
      this.posX[i.note + i.octave] = tmp.getBoundingClientRect().left - rootLeft
    }

    //GARBAGE COLECTOR
    if (this.gcIntervalId !== null) {
      clearInterval(this.gcIntervalId);
    }
    this.gcIntervalId = window.setInterval(() => {
      this.notes = this.notes.filter(i => (i.time * 1000) + i.duration * 1000 + 500 >=  this.piano.curTime);
    }, 250);
  }

  getTime() : number {
    return this.piano.curTime;
  }

  pause(){
    this.piano.playing = !this.piano.playing;
  }

}
