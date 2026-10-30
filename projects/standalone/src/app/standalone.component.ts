import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PlayerEmbedBridge, PlayerShellComponent, PrintContextService, type EmbedOptions, type PanelWaveManifest } from 'player';
import {
  DEFAULT_CONFIG,
  PLACEHOLDER_TITLE,
  chooseLocale,
  embedParamsFromSearch,
  isManifestLike,
  localizedText,
  normalizeConfig,
  pageIdFromSearch,
  panelIdFromSearch,
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
 *
 * Chapter embeds (docs/MULTI_CHAPTER_EMBED.md): `?chapter=` locks the page
 * to one chapter; with `?embed=1` on http(s) it speaks the embed protocol
 * with the framing page. From file:// the bridge stays off (opaque origins).
 */
@Component({
  selector: 'pws-root',
  imports: [PlayerShellComponent],
  templateUrl: './standalone.component.html',
  styleUrl: './standalone.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandaloneComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly bridge = inject(PlayerEmbedBridge);
  private readonly printContext = inject(PrintContextService);

  readonly state = signal<State>('loading');
  readonly manifest = signal<PanelWaveManifest | null>(null);
  readonly config = signal<StandaloneConfig>({ ...DEFAULT_CONFIG });
  readonly locale = signal('en-US');
  /** Page from `?page=` (a manifest page id); undefined = the start of the work. */
  readonly pageId = signal<string | undefined>(undefined);
  readonly panelId = signal<string | undefined>(undefined);
  /** Chapter embed: the chapter the page is locked to. */
  readonly chapterScope = signal<string | undefined>(undefined);
  readonly autoplay = signal(false);
  readonly showToolbar = signal(DEFAULT_CONFIG.showToolbar);
  readonly showCover = signal(DEFAULT_CONFIG.showCover);
  readonly secondsPerPanel = signal(5);
  readonly imageCacheBudgetMb = signal<number | undefined>(undefined);

  /** The shell, once mounted: the embed bridge follows it. */
  @ViewChild(PlayerShellComponent)
  set shellRef(shell: PlayerShellComponent | undefined) {
    if (shell && this.bridge.connected) {
      this.bridge.attach(shell);
    }
  }

  ngOnDestroy(): void {
    this.bridge.disconnect();
  }

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

  /** Live options from the framing page (`setOptions` / `config`). */
  private applyOptions(options: EmbedOptions): void {
    if (typeof options.autoplay === 'boolean') this.autoplay.set(options.autoplay);
    if (typeof options.showToolbar === 'boolean') this.showToolbar.set(options.showToolbar);
    if (typeof options.showCover === 'boolean') this.showCover.set(options.showCover);
    const seconds = Number(options.secondsPerPanel);
    if (Number.isFinite(seconds) && seconds > 0) this.secondsPerPanel.set(seconds);
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
    this.panelId.set(panelIdFromSearch(window.location.search));
    const embed = embedParamsFromSearch(window.location.search, config);
    this.chapterScope.set(embed.chapter);
    this.autoplay.set(embed.autoplay ?? false);
    this.showToolbar.set(embed.showToolbar ?? config.showToolbar);
    // A chapter page starts at its chapter, not on the work's cover.
    this.showCover.set(embed.showCover ?? (embed.chapter ? false : config.showCover));
    if (embed.secondsPerPanel) this.secondsPerPanel.set(embed.secondsPerPanel);
    if (embed.embed && embed.chapter) this.imageCacheBudgetMb.set(32);
    const httpPage = window.location.protocol === 'http:' || window.location.protocol === 'https:';
    if (embed.embed && httpPage && !config.print) {
      this.bridge.connect({
        hostOrigin: embed.origin ?? window.location.origin,
        handlers: { setOptions: (options) => this.applyOptions(options) },
      });
    }
    // Print renders (CMS PDF export) get a hook for their print stylesheet.
    document.documentElement.classList.toggle('pw-print', !!config.print);
    this.printContext.configure(config.print ? config.printOptions : undefined);
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
