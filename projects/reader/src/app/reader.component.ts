import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { PlayerShellComponent, type PanelWaveManifest } from 'player';
import { BadgeComponent } from './badge/badge.component';
import { readBootConfig, type ReaderBootConfig } from './boot-config';
import { lockedAdapterFor } from './locked-adapter';

type Adapter = ReturnType<typeof lockedAdapterFor>;
type State = 'empty' | 'loading' | 'error' | 'ready';

@Component({
  selector: 'pwr-root',
  imports: [PlayerShellComponent, BadgeComponent],
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
  readonly adapter = signal<Adapter | undefined>(undefined);

  ngOnInit(): void {
    if (this.config.title) {
      document.title = this.config.title;
    }
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
        this.adapter.set(lockedAdapterFor(manifest));
        this.manifest.set(manifest);
        this.state.set('ready');
      },
      error: () => {
        this.inFlight = false;
        this.state.set('error');
      },
    });
  }
}
