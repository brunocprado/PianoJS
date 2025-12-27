import { Component, OnInit, ViewChild } from '@angular/core';
import { PianoService } from './shared/services/piano-service';

// @ts-ignore  
import { JZZ } from 'jzz'; 

import { Midi } from '@tonejs/midi'
import { Note } from '@tonejs/midi/dist/Note';
import { NotesDisplayComponent } from './notes-display/notes-display.component';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrl: './app.component.css',
    standalone: false
})
export class AppComponent implements OnInit {

  @ViewChild(NotesDisplayComponent) child!:NotesDisplayComponent;
  
  midiNotes : Note[] = []

  constructor(private piano: PianoService) {}

  ngOnInit(): void {
    JZZ().or('Cannot start MIDI engine!!!').and('MIDI engine is running!!!');
    var input = JZZ().openMidiIn();
    var onReceiveNote = JZZ.Widget({ _receive: (msg: number[]) => { 
      this.piano.processNote(msg)
    }});
    input.connect(onReceiveNote);
  }

  load() : void {
    this.piano.loadSounds()
  }

  async loadMidi(ev : any) {
    var r = new FileReader();
    r.onload = async (e) => { 
      // @ts-ignore  
      const midi =  new Midi(r.result)
      console.log("MIDI CARREGADO", midi)
      this.midiNotes = midi.tracks[0].notes;
      this.piano.playMidi(midi.tracks[0].notes)
      this.child.teste(this.midiNotes)
    }
    r.readAsArrayBuffer(ev.target.files[0]);
  }

}


