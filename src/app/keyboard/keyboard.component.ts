import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { PianoService } from '../shared/services/piano-service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-keyboard',
  templateUrl: './keyboard.component.html',
  styleUrl: './keyboard.component.css'
})
export class KeyboardComponent implements OnInit {

  pianoKeys : any[] = []
  public pianoEvent$ = new Observable<string[]>();
  pressedKeys: string[] = []

  constructor(private piano: PianoService, private zone:NgZone) {}
  
  ngOnInit(): void {
    this.pianoKeys = this.piano.generateKeys();
    this.piano.getEvent$().subscribe((keys: string[]) => {
      this.pressedKeys = keys;
      this.zone.run(() => {
        console.log(this.pressedKeys);
      });
   });
  }
  
}