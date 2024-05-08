import { Component, OnInit } from '@angular/core';
import { PianoService } from '../shared/services/piano-service';

@Component({
  selector: 'app-keyboard',
  templateUrl: './keyboard.component.html',
  styleUrl: './keyboard.component.css'
})
export class KeyboardComponent implements OnInit {

  pianoKeys : any[] = []

  constructor(private piano: PianoService) {}
  
  ngOnInit(): void {
    this.pianoKeys = this.piano.generateKeys();
  }
  
}
