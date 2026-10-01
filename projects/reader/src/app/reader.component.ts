import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { PlayerShellComponent, type PanelWaveManifest } from 'player';
import { readBootConfig, type ReaderBootConfig } from './boot-config';
import { forReview } from './review-rules';

type State = 'empty' | 'loading' | 'error' | 'ready';

/**
 * The public reader. Gating is left to the shell's PaywallService (manifest
 * `paywall.rules` + `x-locked` stubs, anonymous snapshot), so paywall and age
 * gates behave as in the player. A review link cuts every rule down to its
 * age part (`forReview`): paid parts open, age gates still ask.
 */
@Component({
  selector: 'pwr-root',
  imports: [PlayerShellComponent],
  templateUrl: './reader.component.html',
  styleUrl: './reader.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReaderComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private inFlight = false;

  readonly config: ReaderBootConfig = readBootConfig(window);
  readonly state = signal<State>('loading');
  readonly manifest = signal<PanelWaveManifest | null>(null);
  readonly locale = signal('en-US');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (this.inFlight) {
      return;
    }
    if (!this.config.manifestUrl) {
      this.state.set('empty');
      return;
    }
    this.state.set('loading');
    this.inFlight = true;
    this.http
      .get<PanelWaveManifest>(this.config.manifestUrl)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (manifest) => {
          this.inFlight = false;
          this.locale.set(this.config.locale ?? manifest.meta?.default_locale ?? 'en-US');
          this.manifest.set(this.config.mode === 'review' ? forReview(manifest) : manifest);
          this.state.set('ready');
        },
        error: () => {
          this.inFlight = false;
          this.state.set('error');
        },
      });
  }
}
