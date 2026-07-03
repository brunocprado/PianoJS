import { Component, OnInit, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { PianoService } from '../shared/services/piano-service';

@Component({
    selector: 'app-keyboard',
    templateUrl: './keyboard.component.html',
    styleUrl: './keyboard.component.css',
    imports: [NgClass],
})
export class KeyboardComponent implements OnInit {

  readonly pianoKeys = signal<any[]>([]);

  constructor(readonly piano: PianoService) {}
  
  ngOnInit(): void {
    this.pianoKeys.set(this.piano.generateKeys());
  }

  play(key : number) : void {
    this.piano.processNote([0x90, key, 1])
  }

  stop(key : number) : void {
    this.piano.processNote([0x80, key, 1])
  }
  
}
