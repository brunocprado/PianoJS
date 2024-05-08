import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
// @ts-ignore  
import { JZZ } from 'jzz'; 
import { PianoService } from './shared/services/piano-service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {

  /*
    ## Note On = 0x90 - off = 0x80 
    [status, pitch, velocity]
    https://www.cs.cmu.edu/~music/cmsip/readings/MIDI%20tutorial%20for%20programmers.html
  */
  
  title = 'PianoJS';

  constructor(private piano: PianoService) {}

  ngOnInit(): void {
    JZZ().or('Cannot start MIDI engine!!!').and('MIDI engine is running!!!');
    var input = JZZ().openMidiIn();
    var onReceiveNote = JZZ.Widget({ _receive: (msg: number[]) => { 
      console.log(msg)
      console.log(this.piano.printNote(msg))
    }});
    input.connect(onReceiveNote);
  }

  renderKeyboard() : void {

  }

}


