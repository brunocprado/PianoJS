import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
// @ts-ignore  
import { JZZ } from 'jzz'; 

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

  min : number = 36
  max : number = 96

  ngOnInit(): void {
    JZZ().or('Cannot start MIDI engine!!!').and('MIDI engine is running!!!');
    var input = JZZ().openMidiIn();
    var onReceiveNote = JZZ.Widget({ _receive: function(msg: any) { 
      console.log(msg)
    }});
    input.connect(onReceiveNote);
  }

  renderKeyboard() : void {

  }

}
