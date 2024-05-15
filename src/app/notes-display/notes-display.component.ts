import { Component, Input, NgZone, OnInit } from '@angular/core';
import { PianoService } from '../shared/services/piano-service';
import { Note } from '@tonejs/midi/dist/Note';

@Component({
  selector: 'app-notes-display',
  templateUrl: './notes-display.component.html',
  styleUrls: ['./notes-display.component.css']
})
export class NotesDisplayComponent {

  noteColors: { [v: string]: string } = {
    "C" : "red", 
    "C#" : "darkred", 
    "D" : "yellow", 
    "D#" : "gold", 
    "E" : "black", 
    "F" : "lightblue",
    "F#" : "blue", 
    "G" : "lightgreen", 
    "G#" : "green",
    "A" : "pink", 
    "A#" : "purple", 
    "B": "violet"
  }

  time: number = 0
  @Input() notes : Note[] = []

  posX : { [v: string]: number } = {}
  
  constructor(private piano: PianoService, private zone:NgZone) { }

  getPosX(note : string) : number {
    if(note.includes("#")) return -50
    let element = document.querySelector('#pianoContainer #' + note + '.containerKey')
    if(!element) return -50
    return element.getBoundingClientRect().left
  }

  teste(){
    for (var i of this.piano.generateKeys()){
      var tmp = document.querySelector('#pianoContainer #' + i.note.replace("#", "b") + i.octave + '.containerKey')
      if(!tmp) continue
      this.posX[i.note + i.octave] = tmp.getBoundingClientRect().left
    }
    setInterval(() => {
      if(this.piano.playing) this.time+=25; else stop; 
    }, 25)
  }

}
