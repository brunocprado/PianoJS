import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PianoService } from './shared/services/piano-service';
import { KeyboardComponent } from './keyboard/keyboard.component';

// @ts-ignore  
import { JZZ } from 'jzz'; 
// @ts-ignore  
import { Kbd } from 'jzz-input-kbd';
// @ts-ignore  
import { Gear } from 'jzz-midi-gear';
Gear(JZZ);

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  
  title = 'PianoJS';

  constructor(private piano: PianoService) {}

  ngOnInit(): void {
    // Kbd(JZZ);
    // JZZ.input.Kbd({at:'teste'});
    
    JZZ().or('Cannot start MIDI engine!!!').and('MIDI engine is running!!!');
    var input = JZZ().openMidiIn();
    var onReceiveNote = JZZ.Widget({ _receive: (msg: number[]) => { 
      console.log(this.piano.printNote(msg))
    }});
    input.connect(onReceiveNote);
  }

  renderKeyboard() : void {

  }

}


