import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Button } from '@openng/optimus-ui/button';
import { PianoService } from '../shared/services/piano-service';
import { GameService } from './game.service';

@Component({
  selector: 'app-game-hud',
  templateUrl: './game-hud.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
})
export class GameHudComponent {
  readonly game = inject(GameService);
  private readonly piano = inject(PianoService);

  countdown(): number {
    if (this.game.phase() !== 'playing') return 0;
    const time = this.piano.curTime();
    if (time >= 0) return 0;
    return Math.ceil(-time / 1000);
  }

  pips(): boolean[] {
    const state = this.game.state();
    const filled = state.multiplier >= 4 && state.combo >= 30 ? 10 : state.combo % 10;
    return Array.from({ length: 10 }, (_, index) => index < filled);
  }

  formatScore(score: number): string {
    return Math.floor(score).toLocaleString('pt-BR');
  }

  formatAccuracy(accuracy: number): string {
    return `${accuracy.toFixed(1)}%`;
  }

  replay(): void {
    this.game.replay();
  }
}
