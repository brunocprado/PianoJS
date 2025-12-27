import { Component } from '@angular/core';
import { PianoService } from '../shared/services/piano-service';
import { Note } from '@tonejs/midi/dist/Note';

@Component({
    selector: 'app-notes-display',
    templateUrl: './notes-display.component.html',
    styleUrls: ['./notes-display.component.css'],
    standalone: false
})
export class NotesDisplayComponent {

  noteColors: { [v: string]: string } = {
    "C" : "red", 
    "C#" : "darkred", 
    "D" : "yellow", 
    "D#" : "gold", 
    "E" : "purple", 
    "F" : "lightblue",
    "F#" : "blue", 
    "G" : "lightgreen", 
    "G#" : "green",
    "A" : "pink", 
    "A#" : "crimson", 
    "B": "violet"
  }

  time: number = 0
  notes : Note[] = []

  posX : { [v: string]: number } = {}
  
  constructor(private piano: PianoService) { }

  getPosX(note : string) : number {
    if(note.includes("#")) return -50
    let element = document.querySelector('#pianoContainer #' + note + '.containerKey')
    if(!element) return -50
    return element.getBoundingClientRect().left
  }

  teste(notes : Note[]){
    this.notes = notes;
    for (var i of this.piano.generateKeys()){
      var tmp = document.querySelector('#pianoContainer #' + i.note.replace("#", "b") + i.octave + '.containerKey')
      if(!tmp) continue
      this.posX[i.note + i.octave] = tmp.getBoundingClientRect().left
    }
    //GARBAGE COLECTOR
    setInterval(() => {
      this.notes = this.notes.filter(i => (i.time * 1000) + i.duration * 1000 + 500 >=  this.piano.curTime);
    }, 250)
  }

  getTime() : number {
    return this.piano.curTime;
  }

  pause(){
    this.piano.playing = !this.piano.playing;
  }

}
