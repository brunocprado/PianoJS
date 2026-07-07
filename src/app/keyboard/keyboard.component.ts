import { Component, effect, inject, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { PianoService } from '../shared/services/piano-service';

@Component({
    selector: 'app-keyboard',
    templateUrl: './keyboard.component.html',
    styleUrl: './keyboard.component.css',
    imports: [NgClass],
})
export class KeyboardComponent {

  readonly piano = inject(PianoService);

  readonly pianoKeys = signal<ReturnType<PianoService['generateKeys']>>([]);

  constructor() {
    effect(() => {
      this.piano.settings();
      this.pianoKeys.set(this.piano.generateKeys());
    });
  }

  play(key: number): void {
    this.piano.processNote([0x90, key, 90]);
  }

  stop(key: number): void {
    this.piano.processNote([0x80, key, 0]);
  }
}
