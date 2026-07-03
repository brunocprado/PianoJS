import { Component, signal } from '@angular/core';
import { PianoService } from '../shared/services/piano-service';
import { Settings } from '../shared/models/settings';

@Component({
    selector: 'app-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.css'],
})
export class SettingsComponent {

  readonly settings = signal<Settings | null>(null);

  constructor(private piano : PianoService) { }

  loadSettings() : void {
    this.settings.set(this.piano.settings());
  }

  saveSettings() : void {
    const current = this.settings();
    if (current) {
      this.piano.settings.set(current);
    }
  }

}
