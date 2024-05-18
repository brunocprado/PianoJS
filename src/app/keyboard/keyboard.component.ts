import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { PianoService } from '../shared/services/piano-service';

@Component({
  selector: 'app-keyboard',
  templateUrl: './keyboard.component.html',
  styleUrl: './keyboard.component.css'
})
export class KeyboardComponent implements OnInit {

  pianoKeys : any[] = []
  pressedKeys: string[] = []

  constructor(private piano: PianoService, private zone:NgZone) {}
  
  ngOnInit(): void {
    this.pianoKeys = this.piano.generateKeys();
    this.piano.getEvent$().subscribe((keys: string[]) => {
      this.pressedKeys = keys;
   });
  }

  play(key : number) : void {
    this.piano.processNote([0x90, key, 1])
  }

  stop(key : number) : void {
    console.log(key)
    this.piano.processNote([0x80, key, 1])
  }
  
}
