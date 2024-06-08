import { Component, OnInit } from '@angular/core';
import { PianoService } from '../shared/services/piano-service';
import { Settings } from '../shared/models/settings';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent {

  settings !: Settings;

  constructor(private piano : PianoService) { }

  loadSettings() : void {
    this.settings = this.piano.settings //mover o resto dos param do service pra class
  }

  saveSettings() : void {
    this.piano.settings = this.settings
  }

}
