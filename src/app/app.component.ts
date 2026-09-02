import { Component, ElementRef, OnInit, signal, viewChild, ChangeDetectionStrategy } from '@angular/core';
import { PianoService } from './shared/services/piano-service';
import { Button } from '@openng/optimus-ui/button';
import { Tag } from '@openng/optimus-ui/tag';
import { Toolbar } from '@openng/optimus-ui/toolbar';

// @ts-ignore
import { JZZ } from 'jzz';

import { Midi } from '@tonejs/midi';
import { NotesDisplayComponent } from './notes-display/notes-display.component';
import { KeyboardComponent } from './keyboard/keyboard.component';
import { SettingsDialogComponent } from './settings/settings.component';
import { LyricLine } from './shared/models/lyric-line';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrl: './app.component.css',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
      NotesDisplayComponent,
      KeyboardComponent,
      SettingsDialogComponent,
      Toolbar,
      Button,
      Tag,
    ],
})
export class AppComponent implements OnInit {

  private readonly notesDisplay = viewChild(NotesDisplayComponent);
  private readonly midiInput = viewChild<ElementRef<HTMLInputElement>>('midiInput');

  readonly showSettings = signal(false);

  constructor(readonly piano: PianoService) {}

  ngOnInit(): void {
    JZZ().or('Cannot start MIDI engine!!!').and('MIDI engine is running!!!');
    const input = JZZ().openMidiIn();
    const onReceiveNote = JZZ.Widget({
      _receive: (msg: number[]) => {
        this.piano.processNote(msg);
      }
    });
    input.connect(onReceiveNote);
  }

  load(): void {
    this.piano.loadSounds();
  }

  openSettings(): void {
    this.showSettings.set(true);
  }

  closeSettings(): void {
    this.showSettings.set(false);
  }

  onSettingsApplied(): void {
    this.showSettings.set(false);
  }

  triggerMidiUpload(): void {
    this.midiInput()?.nativeElement.click();
  }

  toggleRecording(): void {
    if (this.piano.recording()) {
      this.downloadRecording();
      return;
    }
    this.piano.startRecording();
  }

  downloadRecording(): void {
    const data = this.piano.stopRecording();
    if (!data) return;

    const blob = new Blob([new Uint8Array(data)], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pianojs-${Date.now()}.mid`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async loadMidi(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const midi = new Midi(buffer);
    const notes = midi.tracks.flatMap(track => track.notes);
    const lyrics: LyricLine[] = midi.header.meta
      .filter(event => event.type === 'lyrics' || event.type === 'text')
      .map(event => ({
        text: event.text,
        time: midi.header.ticksToSeconds(event.ticks)
      }))
      .sort((a, b) => a.time - b.time);

    this.piano.playMidi(notes);
    this.notesDisplay()?.loadNotes(notes, lyrics);
    input.value = '';
  }
}
