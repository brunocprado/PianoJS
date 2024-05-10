import { Component, OnInit } from '@angular/core';
import { PianoService } from './shared/services/piano-service';

// @ts-ignore  
import { JZZ } from 'jzz'; 
// // @ts-ignore  
// import { Gear } from 'jzz-midi-gear';
// Gear(JZZ);

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  
  constructor(private piano: PianoService) {}

  ngOnInit(): void {
    JZZ().or('Cannot start MIDI engine!!!').and('MIDI engine is running!!!');
    var input = JZZ().openMidiIn();
    var teste = 0;
    var onReceiveNote = JZZ.Widget({ _receive: (msg: number[]) => { 
      if(teste++ == 0) this.piano.loadSounds()
      this.piano.processNote(msg)
    }});
    input.connect(onReceiveNote);
  }

}


