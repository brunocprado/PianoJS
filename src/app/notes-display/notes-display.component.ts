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
    "E" : "#555", 
    "F" : "lightblue",
    "F#" : "blue", 
    "G" : "lightgreen", 
    "G#" : "green",
    "A" : "pink", 
    "A#" : "purple", 
    "B": "violet"
  }

  time: number = 0
  notes : Note[] = []

  posX : { [v: string]: number } = {}
  
  constructor(private piano: PianoService, private zone:NgZone) { }

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
    setInterval(() => {
      if(this.piano.playing) this.time+=20; else stop; 
    }, 20)
    //GARBAGE COLECTOR
    setInterval(() => {
      var tmp = []
      for(let i of this.notes){
        if(i.time * 1000 + 500 >= this.time) tmp.push(i)
      }
      this.notes = tmp
    }, 400)
  }

}
