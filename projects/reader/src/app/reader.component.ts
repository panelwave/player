import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import {
  PlayerEmbedBridge,
  PlayerShellComponent,
  locationUrl,
  parseLocationSearch,
  type EmbedOptions,
  type PanelWaveManifest,
  type PlayerLocation,
} from 'player';
import { readBootConfig, readEmbedOptions, type ReaderBootConfig } from './boot-config';
import { forReview } from './review-rules';
import { readRememberedLocale, rememberLocale, startLocale } from './start-locale';

type State = 'empty' | 'loading' | 'error' | 'ready';

/** Origin of the page that opened / frames the reader, from document.referrer. */
function referrerOrigin(): string | undefined {
  try {
    return document.referrer ? new URL(document.referrer).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The public reader. Gating is left to the shell's PaywallService (manifest
 * `paywall.rules` + `x-locked` stubs, anonymous snapshot), so paywall and age
 * gates behave as in the player. A review link cuts every rule down to its
 * age part (`forReview`): paid parts open, age gates still ask.
 *
 * The address bar follows the reading position (`?page=` in page view,
 * `?panel=` in panel view, nothing on the cover), so every page and panel
 * has its own URL to bookmark and share; opening such a URL starts there.
 *
 * Embedded (`embed`), it speaks the embed protocol with the framing page
 * (`PlayerEmbedBridge`) and leaves the address bar alone; a `chapter` locks
 * it to one chapter — the chapter embeds of docs/MULTI_CHAPTER_EMBED.md.
 */
@Component({
  selector: 'pwr-root',
  imports: [PlayerShellComponent],
  templateUrl: './reader.component.html',
  styleUrl: './reader.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReaderComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly bridge = inject(PlayerEmbedBridge);
  private inFlight = false;

  readonly config: ReaderBootConfig = readBootConfig(window);
  readonly embedOptions = readEmbedOptions(window);

  /** Chapter the reader is locked to (chapter embeds). */
  readonly chapterScope = this.embedOptions.chapter;
  readonly autoplay = signal(this.embedOptions.autoplay ?? false);
  readonly showToolbar = signal(this.embedOptions.showToolbar ?? false);
  readonly showCover = signal(this.embedOptions.showCover ?? !this.chapterScope);
  readonly secondsPerPanel = signal(this.embedOptions.secondsPerPanel ?? 5);
  /** Analytics: which site embeds the reader (dashboard split "embedded vs. reader"). */
  readonly trackingContext = this.config.embed
    ? { embedHost: this.embedOptions.embedOrigin ?? referrerOrigin() ?? 'unknown' }
    : undefined;
  /** Several chapter embeds share the device: each keeps a smaller image cache. */
  readonly imageCacheBudgetMb = this.config.embed && this.chapterScope ? 32 : undefined;

  /** The shell, once mounted: the embed bridge follows it. */
  @ViewChild(PlayerShellComponent)
  set shellRef(shell: PlayerShellComponent | undefined) {
    if (shell && this.bridge.connected) {
      this.bridge.attach(shell);
    }
  }
  readonly state = signal<State>('loading');
  readonly manifest = signal<PanelWaveManifest | null>(null);
  readonly locale = signal('en-US');
  /** Position the URL links to (`?page=` / `?panel=`), read once at start. */
  readonly start = parseLocationSearch(window.location.search);

  ngOnInit(): void {
    if (this.config.embed) {
      this.bridge.connect({
        hostOrigin: this.embedOptions.embedOrigin ?? window.location.origin,
        handlers: { setOptions: (options) => this.applyOptions(options) },
      });
    }
    this.load();
  }

  ngOnDestroy(): void {
    this.bridge.disconnect();
  }

  /** Live options from the framing page (`setOptions` / `config`). */
  private applyOptions(options: EmbedOptions): void {
    if (typeof options.autoplay === 'boolean') this.autoplay.set(options.autoplay);
    if (typeof options.showToolbar === 'boolean') this.showToolbar.set(options.showToolbar);
    if (typeof options.showCover === 'boolean') this.showCover.set(options.showCover);
    const seconds = Number(options.secondsPerPanel);
    if (Number.isFinite(seconds) && seconds > 0) this.secondsPerPanel.set(seconds);
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
          const defaultLocale = manifest.meta?.default_locale ?? 'en-US';
          this.locale.set(
            startLocale({
              available: manifest.meta?.locales ?? [defaultLocale],
              defaultLocale,
              urlLang: new URLSearchParams(window.location.search).get('lang'),
              configLocale: this.config.locale,
              remembered: readRememberedLocale(this.storage()),
              browser: navigator.languages ?? [navigator.language],
            })
          );
          this.manifest.set(this.config.mode === 'review' ? forReview(manifest) : manifest);
          this.state.set('ready');
        },
        error: () => {
          this.inFlight = false;
          this.state.set('error');
        },
      });
  }

  /** A language the reader picked is remembered on this device for the next visit. */
  onLocaleChange(locale: string): void {
    if (locale === this.locale()) {
      return; // the shell echoing the locale it was given
    }
    this.locale.set(locale);
    rememberLocale(this.storage(), locale);
  }

  private storage(): Storage | undefined {
    try {
      return window.localStorage;
    } catch {
      return undefined;
    }
  }

  /** Keep the address bar on the reading position (no history entry per panel). */
  onLocationChange(location: PlayerLocation): void {
    const next = locationUrl(window.location.href, location);
    if (next !== window.location.href) {
      window.history.replaceState(window.history.state, '', next);
    }
  }
}
