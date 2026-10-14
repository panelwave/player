import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PlayerShellComponent, type PanelWaveManifest } from 'player';
import {
  DEFAULT_CONFIG,
  PLACEHOLDER_TITLE,
  chooseLocale,
  isManifestLike,
  localizedText,
  normalizeConfig,
  pageIdFromSearch,
  planBoot,
  type StandaloneConfig,
  type StandaloneWindow,
} from './boot';

type State = 'loading' | 'ready' | 'missing' | 'error';

/**
 * Standalone player: reads one work packaged next to index.html (exported
 * from the PanelWave CMS as "Package with player", or built by hand) and
 * shows it full-screen. Works from disk (file://) and from any static host.
 * No paywall, analytics or CMS connection: what is in the package is readable.
 */
@Component({
  selector: 'pws-root',
  imports: [PlayerShellComponent],
  templateUrl: './standalone.component.html',
  styleUrl: './standalone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandaloneComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  readonly state = signal<State>('loading');
  readonly manifest = signal<PanelWaveManifest | null>(null);
  readonly config = signal<StandaloneConfig>({ ...DEFAULT_CONFIG });
  readonly locale = signal('en-US');
  /** Page from `?page=` (a manifest page id); undefined = the start of the work. */
  readonly pageId = signal<string | undefined>(undefined);

  ngOnInit(): void {
    const plan = planBoot(window as unknown as StandaloneWindow, window.location.protocol);
    if (plan.kind === 'inline') {
      this.start(plan.manifest, plan.config);
    } else if (plan.kind === 'missing') {
      this.state.set('missing');
    } else {
      this.fetchPackage();
    }
  }

  onLocaleChange(locale: string): void {
    this.locale.set(locale);
  }

  private fetchPackage(): void {
    forkJoin({
      manifest: this.http.get<unknown>('./panelwave.json'),
      // The config is optional: a missing file means defaults.
      config: this.http.get<unknown>('./panelwave.config.json').pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ manifest, config }) => {
          if (isManifestLike(manifest)) {
            this.start(manifest, normalizeConfig(config));
          } else {
            this.state.set('error');
          }
        },
        error: () => this.state.set('error'),
      });
  }

  private start(manifest: PanelWaveManifest, config: StandaloneConfig): void {
    const locale = chooseLocale(manifest, window.location.search, config);
    this.config.set(config);
    this.locale.set(locale);
    this.pageId.set(pageIdFromSearch(window.location.search));
    // Print renders (CMS PDF export) get a hook for their print stylesheet.
    document.documentElement.classList.toggle('pw-print', !!config.print);
    this.manifest.set(manifest);
    // The CMS export writes the title into index.html; a hand-built package
    // keeps the placeholder, so name the tab after the work instead.
    if (!document.title || document.title === PLACEHOLDER_TITLE) {
      const title = localizedText(manifest.meta?.title, locale, manifest.meta?.default_locale);
      if (title) document.title = title;
    }
    this.state.set('ready');
  }
}
