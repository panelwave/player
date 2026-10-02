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
import {
  PlayerShellComponent,
  locationUrl,
  parseLocationSearch,
  type PanelWaveManifest,
  type PlayerLocation,
} from 'player';
import { readBootConfig, type ReaderBootConfig } from './boot-config';
import { forReview } from './review-rules';

type State = 'empty' | 'loading' | 'error' | 'ready';

/**
 * The public reader. Gating is left to the shell's PaywallService (manifest
 * `paywall.rules` + `x-locked` stubs, anonymous snapshot), so paywall and age
 * gates behave as in the player. A review link cuts every rule down to its
 * age part (`forReview`): paid parts open, age gates still ask.
 *
 * The address bar follows the reading position (`?page=` in page view,
 * `?panel=` in panel view, nothing on the cover), so every page and panel
 * has its own URL to bookmark and share; opening such a URL starts there.
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
  /** Position the URL links to (`?page=` / `?panel=`), read once at start. */
  readonly start = parseLocationSearch(window.location.search);

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

  /** Keep the address bar on the reading position (no history entry per panel). */
  onLocationChange(location: PlayerLocation): void {
    const next = locationUrl(window.location.href, location);
    if (next !== window.location.href) {
      window.history.replaceState(window.history.state, '', next);
    }
  }
}
