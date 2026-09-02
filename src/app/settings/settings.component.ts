import { Component, effect, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from '@openng/optimus-ui/button';
import { Dialog } from '@openng/optimus-ui/dialog';
import { Select } from '@openng/optimus-ui/select';
import { ToggleSwitch } from '@openng/optimus-ui/toggleswitch';
import { PianoService } from '../shared/services/piano-service';
import { Settings } from '../shared/models/settings';

interface SelectOption<T = number> {
  label: string;
  value: T;
}

@Component({
    selector: 'app-settings-dialog',
    templateUrl: './settings.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, Dialog, Select, ToggleSwitch, Button],
})
export class SettingsDialogComponent {

  readonly visible = input(false);
  readonly closed = output<void>();
  readonly applied = output<void>();

  readonly draft = signal({
    minOctave: 2,
    octaveCount: 5,
    useSamples: true,
  });

  readonly startOctaveOptions: SelectOption[] = [1, 2, 3, 4, 5].map(o => ({
    label: `C${o}`,
    value: o,
  }));

  readonly octaveCountOptions: SelectOption[] = [3, 4, 5, 6, 7, 8].map(c => ({
    label: `${c} oitavas`,
    value: c,
  }));

  constructor(private piano: PianoService) {
    effect(() => {
      if (this.visible()) {
        this.loadSettings();
      }
    });
  }

  loadSettings(): void {
    const s = this.piano.settings();
    this.draft.set({
      minOctave: s.minOctave,
      octaveCount: s.octaveCount,
      useSamples: s.useSamples,
    });
  }

  onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.closed.emit();
    }
  }

  updateDraft(partial: Partial<{ minOctave: number; octaveCount: number; useSamples: boolean }>): void {
    this.draft.update(d => ({ ...d, ...partial }));
  }

  async applySettings(): Promise<void> {
    const d = this.draft();
    const settings = Settings.fromOctaves(d.minOctave, d.octaveCount, d.useSamples);
    this.piano.applySettings(settings);
    if (settings.useSamples) {
      await this.piano.loadSounds();
    }
    this.applied.emit();
  }
}
