/**
 * Toolbar Component
 * Bottom toolbar with all player controls
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnChanges,
  OnDestroy,
} from '@angular/core';

import { TranslatePipe } from '@ngx-translate/core';
import type { LocaleCode } from '../../types';
import { PwIconComponent } from '../icon/pw-icon.component';

/**
 * Toolbar Component
 * Provides all player controls in a bottom toolbar
 */
@Component({
    selector: 'pw-toolbar',
    imports: [TranslatePipe, PwIconComponent],
    templateUrl: './toolbar.component.html',
    styleUrls: ['./toolbar.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToolbarComponent implements AfterViewInit, OnChanges, OnDestroy {
  /**
   * Fit steps applied when the bar is still too narrow for its buttons
   * (cumulative `fit-N` classes on the container, see the CSS):
   *   1 Audio + SFX merged, Settings icon only (the desktop tier)
   *   2 right section (Contents, Characters, Alt, Choices, Extras) icon only
   *   3 center section (Speech, Audio, Voices, Autoplay, Thumbnails) icon only
   *   4 "Made with PanelWave" credit hidden (the help icon stays)
   *   5 icons only (the mobile tier)
   * The container queries set the floor per size; these steps go further
   * only as far as the current labels (locale) and buttons need.
   */
  static readonly MAX_FIT_LEVEL = 5;

  @ViewChild('container', { static: true }) private containerRef?: ElementRef<HTMLElement>;
  @ViewChild('bar', { static: true }) private barRef?: ElementRef<HTMLElement>;

  /** Fit step currently applied (0 = none). */
  fitLevel = 0;

  private resizeObserver?: ResizeObserver;
  private mutationObserver?: MutationObserver;
  private contentObserver?: ResizeObserver;
  /** Widths of the bar's sections right after the last fit (ours, not news). */
  private fittedSignature = '';
  private observedWidth = -1;
  private refitFrame = 0;

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Available locales
   */
  @Input() availableLocales: LocaleCode[] = ['en-US'];

  /**
   * Current view mode
   */
  @Input() viewMode: 'page' | 'panel' | 'canvas' = 'panel';

  /**
   * Page view available
   */
  @Input() pageViewAvailable = false;

  /**
   * Speech bubbles enabled
   */
  @Input() speechEnabled = true;

  /**
   * Audio enabled
   */
  @Input() audioEnabled = true;

  /**
   * SFX enabled
   */
  @Input() sfxEnabled = true;

  /**
   * Voices enabled (spoken lines of the balloons, voiceover bus)
   */
  @Input() voicesEnabled = true;

  /**
   * Autoplay enabled
   */
  @Input() autoplayEnabled = false;

  /**
   * Seconds per panel (autoplay). With the author's timing this is the
   * current panel's (page's) authored dwell time, shown for orientation.
   */
  @Input() secondsPerPanel = 5;

  /**
   * Autoplay timing source: 'author' (each panel's durationMs from the CMS
   * timeline) or 'manual' (the reader's seconds per panel).
   */
  @Input() autoplayTiming: 'author' | 'manual' = 'manual';

  /**
   * Autoplay progress (0-100)
   */
  @Input() autoplayProgress = 0;

  /**
   * Thumbnails visible
   */
  @Input() thumbnailsVisible = false;

  /**
   * Has alternatives for current panel
   */
  @Input() hasAlternatives = false;

  /**
   * Has branch choices ahead
   */
  @Input() hasBranches = false;

  /**
   * Reader has liked this work (renders the Like button pressed)
   */
  @Input() liked = false;

  /**
   * Current panel is the reader's bookmark (renders the Bookmark button pressed)
   */
  @Input() bookmarked = false;

  /**
   * Show social controls
   */
  @Input() showSocial = true;

  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Whether the player is in fullscreen (the button then returns to the
   * browser view).
   */
  @Input() fullscreen = false;

  /** Whether the browser can show the player in fullscreen (hides the button when not). */
  @Input() fullscreenAvailable = false;

  /** Fullscreen button clicked: enter fullscreen, or leave it. */
  @Output() toggleFullscreen = new EventEmitter<void>();

  /**
   * Toggle page/panel view
   */
  @Output() toggleView = new EventEmitter<void>();

  /**
   * Locale changed
   */
  @Output() localeChange = new EventEmitter<LocaleCode>();

  /**
   * Toggle speech bubbles
   */
  @Output() toggleSpeech = new EventEmitter<void>();

  /**
   * Toggle audio
   */
  @Output() toggleAudio = new EventEmitter<void>();

  /**
   * Toggle SFX
   */
  @Output() toggleSfx = new EventEmitter<void>();

  /**
   * Toggle voices
   */
  @Output() toggleVoices = new EventEmitter<void>();

  /**
   * Toggle autoplay
   */
  @Output() toggleAutoplay = new EventEmitter<void>();

  /**
   * Seconds per panel changed
   */
  @Output() secondsPerPanelChange = new EventEmitter<number>();

  /**
   * Switch the autoplay timing source (the "Author" button restores the
   * author's timing after the reader picked a speed).
   */
  @Output() autoplayTimingChange = new EventEmitter<'author' | 'manual'>();

  /**
   * Toggle thumbnails
   */
  @Output() toggleThumbnails = new EventEmitter<void>();

  /**
   * Open table of contents
   */
  @Output() openToc = new EventEmitter<void>();

  /**
   * Open settings
   */
  @Output() openSettings = new EventEmitter<void>();

  /**
   * Open characters
   */
  @Output() openCharacters = new EventEmitter<void>();

  /**
   * Cycle alternatives
   */
  @Output() cycleAlternative = new EventEmitter<void>();

  /**
   * Show branch choices
   */
  @Output() showBranches = new EventEmitter<void>();

  /**
   * Open extras
   */
  @Output() openExtras = new EventEmitter<void>();

  /**
   * Like action
   */
  @Output() like = new EventEmitter<void>();

  /**
   * Bookmark action
   */
  @Output() bookmark = new EventEmitter<void>();

  /**
   * Share action
   */
  @Output() share = new EventEmitter<void>();

  /**
   * Open comments
   */
  @Output() openComments = new EventEmitter<void>();

  /**
   * Close toolbar
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Open language modal
   */
  @Output() openLanguage = new EventEmitter<void>();

  ngAfterViewInit(): void {
    const container = this.containerRef?.nativeElement;
    if (container && typeof ResizeObserver !== 'undefined') {
      // Width only: the fit steps change the bar's content, never its width,
      // so this cannot loop.
      this.resizeObserver = new ResizeObserver((entries) => {
        const width = Math.round(entries[entries.length - 1]?.contentRect.width ?? 0);
        if (width !== this.observedWidth) {
          this.observedWidth = width;
          this.fit();
        }
      });
      this.resizeObserver.observe(container);
    }
    // Content changes no input announces: translations arriving (label
    // text), buttons and icons rendering. fit() only touches the container's
    // classes, outside the observed subtree, so this cannot loop either.
    const bar = this.barRef?.nativeElement;
    if (bar && typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(() => this.scheduleFit());
      this.mutationObserver.observe(bar, { childList: true, subtree: true, characterData: true });
    }
    // Width changes without a DOM change (a web font swapping in). fit()
    // resizes the sections too, so only sizes different from the ones it
    // left behind count.
    if (bar && typeof ResizeObserver !== 'undefined') {
      this.contentObserver = new ResizeObserver(() => {
        if (this.sectionSignature(bar) !== this.fittedSignature) this.scheduleFit();
      });
    }
    // Web fonts change the label widths once they arrive.
    if (typeof document !== 'undefined') {
      document.fonts?.ready.then(() => this.scheduleFit()).catch(() => undefined);
    }
    this.fit();
  }

  ngOnChanges(): void {
    // Labels (locale), optional buttons (Alt, Choices, language) and the
    // autoplay controls change the content width: re-fit after rendering.
    this.scheduleFit();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
    this.contentObserver?.disconnect();
    if (this.refitFrame && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.refitFrame);
    }
  }

  /**
   * Apply the smallest fit step at which every button fits the bar without
   * scrolling. Starts from 0 each time, so it also widens again when space
   * grows. Below the mobile tier the bar may still scroll (icons only).
   */
  fit(): void {
    const container = this.containerRef?.nativeElement;
    const bar = this.barRef?.nativeElement;
    if (!container || !bar) return;
    let level = 0;
    this.applyFitLevel(container, level);
    while (level < ToolbarComponent.MAX_FIT_LEVEL && bar.scrollWidth > bar.clientWidth + 1) {
      level++;
      this.applyFitLevel(container, level);
    }
    this.fitLevel = level;
    this.fittedSignature = this.sectionSignature(bar);
    // (Re-)observe the bar's sections: the social one comes and goes.
    for (const child of Array.from(bar.children)) {
      this.contentObserver?.observe(child);
    }
  }

  private sectionSignature(bar: HTMLElement): string {
    return Array.from(bar.children)
      .map((child) => Math.round((child as HTMLElement).offsetWidth))
      .join(',');
  }

  private scheduleFit(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this.refitFrame) cancelAnimationFrame(this.refitFrame);
    this.refitFrame = requestAnimationFrame(() => {
      this.refitFrame = 0;
      this.fit();
    });
  }

  /** Cumulative classes fit-1 … fit-N (DOM only: no change detection round). */
  private applyFitLevel(container: HTMLElement, level: number): void {
    for (let i = 1; i <= ToolbarComponent.MAX_FIT_LEVEL; i++) {
      container.classList.toggle(`fit-${i}`, i <= level);
    }
  }

  /**
   * Handle view toggle
   */
  onToggleView(): void {
    if (this.pageViewAvailable) {
      this.toggleView.emit();
    }
  }

  /**
   * Adjust seconds per panel
   */
  adjustSecondsPerPanel(delta: number): void {
    // From the author's timing, the reader's speed starts at the current
    // panel's authored time (whole seconds).
    const base = this.autoplayTiming === 'author' ? Math.round(this.secondsPerPanel) : this.secondsPerPanel;
    const newValue = Math.max(0.5, Math.min(120, base + delta));
    this.secondsPerPanelChange.emit(newValue);
  }

  /** Go back to the author's panel timing. */
  useAuthorTiming(): void {
    this.autoplayTimingChange.emit('author');
  }

  /**
   * Handle speech toggle
   */
  onToggleSpeech(): void {
    this.toggleSpeech.emit();
  }

  /**
   * Handle audio toggle
   */
  onToggleAudio(): void {
    this.toggleAudio.emit();
  }

  /**
   * Handle SFX toggle
   */
  onToggleSfx(): void {
    this.toggleSfx.emit();
  }

  /**
   * State of the merged Audio button (desktop and mobile toolbars, where
   * music and sound effects share one toggle): `mixed` when only one is on.
   */
  get audioSfxPressed(): 'true' | 'false' | 'mixed' {
    if (this.audioEnabled && this.sfxEnabled) return 'true';
    return this.audioEnabled || this.sfxEnabled ? 'mixed' : 'false';
  }

  /**
   * Merged Audio button: anything on → both off; both off → both on.
   * Emits the existing per-channel toggles, so the host needs no new output.
   */
  onToggleAudioAndSfx(): void {
    if (this.audioEnabled || this.sfxEnabled) {
      if (this.audioEnabled) this.toggleAudio.emit();
      if (this.sfxEnabled) this.toggleSfx.emit();
    } else {
      this.toggleAudio.emit();
      this.toggleSfx.emit();
    }
  }

  /**
   * Handle voices toggle
   */
  onToggleVoices(): void {
    this.toggleVoices.emit();
  }

  /**
   * Handle autoplay toggle
   */
  onToggleAutoplay(): void {
    this.toggleAutoplay.emit();
  }

  /**
   * Handle thumbnails toggle
   */
  onToggleThumbnails(): void {
    this.toggleThumbnails.emit();
  }

  /**
   * Handle ToC open
   */
  onOpenToc(): void {
    this.openToc.emit();
  }

  /**
   * Handle settings open
   */
  onOpenSettings(): void {
    this.openSettings.emit();
  }

  /**
   * Handle characters open
   */
  onOpenCharacters(): void {
    this.openCharacters.emit();
  }

  /**
   * Handle alternative cycle
   */
  onCycleAlternative(): void {
    this.cycleAlternative.emit();
  }

  /**
   * Handle branches display
   */
  onShowBranches(): void {
    this.showBranches.emit();
  }

  /**
   * Handle extras open
   */
  onOpenExtras(): void {
    this.openExtras.emit();
  }

  /**
   * Handle like
   */
  onLike(): void {
    this.like.emit();
  }

  /**
   * Handle bookmark
   */
  onBookmark(): void {
    this.bookmark.emit();
  }

  /**
   * Handle share
   */
  onShare(): void {
    this.share.emit();
  }

  /**
   * Handle comments
   */
  onOpenComments(): void {
    this.openComments.emit();
  }

  /**
   * Handle close
   */
  onClose(): void {
    this.close.emit();
  }
}
