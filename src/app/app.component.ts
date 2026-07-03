import { Component, OnInit, viewChild } from '@angular/core';
import { PianoService } from './shared/services/piano-service';

// @ts-ignore  
import { JZZ } from 'jzz'; 

import { Midi } from '@tonejs/midi'
import { Note } from '@tonejs/midi/dist/Note';
import { NotesDisplayComponent } from './notes-display/notes-display.component';
import { KeyboardComponent } from './keyboard/keyboard.component';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrl: './app.component.css',
    imports: [NotesDisplayComponent, KeyboardComponent],
})
export class AppComponent implements OnInit {

  private readonly notesDisplay = viewChild(NotesDisplayComponent);
  
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

  async loadMidi(ev : Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    var r = new FileReader();
    r.onload = async () => { 
      const midi = new Midi(r.result as ArrayBuffer)
      console.log("MIDI CARREGADO", midi)
      const notes = midi.tracks[0].notes;
      this.piano.playMidi(notes)
      this.notesDisplay()?.teste(notes)
    }
    r.readAsArrayBuffer(file);
  }

}
