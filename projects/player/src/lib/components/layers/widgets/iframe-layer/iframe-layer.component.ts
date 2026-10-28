/**
 * Iframe layer (schema 1.10+ `kind: "iframe"`): an embedded external page
 * (map, quiz, form, video platform, H5P, …) in a themed card with its title
 * and an "Open in new tab" link — the reader's way out when the page refuses
 * to be framed (the player cannot detect that cross-origin).
 *
 * Safety: https only and never the reader's own origin (checkIframeUrl);
 * `sandbox` presets (default keeps allow-same-origin, which common embeds
 * need — safe because same-origin sources are refused); `allow` limited to an
 * allowlist; strict-origin-when-cross-origin referrer. `lazy` (default) mounts
 * the frame only while its panel is current (panel / canvas view) or on
 * screen (page view), so paging never loads third-party pages in the
 * background. Print renders never load the frame.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import type { IframeLayer } from '../../../../types';
import { WidgetPlaybackService } from '../../../../services/widget-playback.service';
import {
  checkIframeUrl,
  displayHost,
  iframeAllowValue,
  iframeSandboxValue,
  isPrintRender,
  type IframeUrlVerdict,
} from '../../../../utils/widget-utils';
import { PwIconComponent } from '../../../icon/pw-icon.component';
import { PrintContextService } from '../../../../services/print-context.service';
import { PrintQrComponent } from '../print-qr/print-qr.component';
import { localized, widgetRootStyles, widgetText } from '../widget-shared';

@Component({
  selector: 'pw-iframe-layer',
  standalone: true,
  imports: [NgStyle, PwIconComponent, PrintQrComponent],
  templateUrl: './iframe-layer.component.html',
  styleUrls: ['../widget-card.css', './iframe-layer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IframeLayerComponent implements OnChanges, AfterViewInit, OnDestroy {
  private readonly playback = inject(WidgetPlaybackService, { optional: true });
  private readonly translate = inject(TranslateService, { optional: true });
  private readonly printContext = inject(PrintContextService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  @Input({ required: true }) layer!: IframeLayer;
  @Input() locale = 'en-US';
  @Input() panelId = '';
  /** The owning panel is the current one (panel / canvas view). */
  @Input() viewActive = false;
  @Input() viewMode: 'panel' | 'page' | 'canvas' | string = 'panel';

  readonly print = isPrintRender();

  /** Print card: QR code to this panel in the online reader (null: none). */
  get printLink(): string | null {
    return this.print ? this.printContext.linkFor(this.panelId) : null;
  }
  verdict: IframeUrlVerdict = 'invalid';
  /** The checked src (https, not our origin), or null. */
  trustedSrc: string | null = null;
  private frame: HTMLIFrameElement | null = null;

  /**
   * The frame is created in code: Angular refuses `sandbox` / `allow`
   * bindings on an <iframe> (NG0910), and both must be set before `src`
   * so the first load is already sandboxed. The host div only exists while
   * the frame is mounted.
   */
  @ViewChild('frameHost') set frameHost(ref: ElementRef<HTMLElement> | undefined) {
    if (!ref) {
      this.frame = null;
      return;
    }
    if (this.frame && ref.nativeElement.contains(this.frame)) return;
    ref.nativeElement.replaceChildren(this.createFrame());
  }
  /** Page view: the box is on (or near) screen. */
  onScreen = false;
  private opened = false;
  private observer?: IntersectionObserver;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['layer']) {
      const origin = typeof location !== 'undefined' ? location.origin : null;
      this.verdict = checkIframeUrl(this.layer?.src, origin);
      this.trustedSrc = this.verdict === 'ok' ? this.layer.src : null;
      if (this.frame && this.trustedSrc && this.frame.getAttribute('src') !== this.trustedSrc) {
        // A changed layer (editor preview): rebuild with the new attributes.
        this.frame.replaceWith(this.createFrame());
      }
    }
    this.reportOpen();
  }

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.onScreen = true;
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        if (visible !== this.onScreen) {
          this.onScreen = visible;
          this.reportOpen();
          this.cdr.markForCheck();
        }
      },
      { rootMargin: '200px' }
    );
    this.observer.observe(this.elementRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  /** Whether the frame is in the DOM now. */
  get mounted(): boolean {
    if (this.print || !this.trustedSrc) return false;
    if (this.layer?.lazy === false) return true;
    return this.viewMode === 'page' ? this.onScreen : this.viewActive;
  }

  get title(): string {
    return localized(this.layer?.title, this.locale) || widgetText(this.translate, 'embedded_content');
  }

  get hostName(): string {
    return displayHost(this.layer?.src);
  }

  get showOpenLink(): boolean {
    return this.layer?.showOpenLink !== false && this.verdict === 'ok';
  }

  get sandbox(): string | null {
    return iframeSandboxValue(this.layer?.sandbox);
  }

  get allow(): string | null {
    return iframeAllowValue(this.layer?.allow) || null;
  }

  get allowFullscreen(): boolean {
    return (this.layer?.allow ?? []).includes('fullscreen');
  }

  get plain(): boolean {
    return this.layer?.appearance === 'plain';
  }

  get rootStyles(): Record<string, string> {
    return widgetRootStyles(this.layer);
  }

  text(key: string): string {
    return widgetText(this.translate, key);
  }

  private createFrame(): HTMLIFrameElement {
    const frame = document.createElement('iframe');
    frame.className = 'frame';
    const sandbox = this.sandbox;
    if (sandbox !== null) frame.setAttribute('sandbox', sandbox);
    if (this.allow) frame.setAttribute('allow', this.allow);
    if (this.allowFullscreen) frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    frame.setAttribute('loading', 'lazy');
    frame.title = this.title;
    // Only ever a URL that passed checkIframeUrl (https, foreign origin).
    if (this.trustedSrc) frame.src = this.trustedSrc;
    this.frame = frame;
    return frame;
  }

  /** `open` once per instance, the first time the frame is shown. */
  private reportOpen(): void {
    if (this.opened || !this.mounted) return;
    this.opened = true;
    this.playback?.emit({ type: 'open', layerId: this.layer.id, kind: 'iframe', panelId: this.panelId || undefined });
  }
}
