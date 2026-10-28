/**
 * Scroll text layer (schema 1.10+ `kind: "scrollText"`): longer text that
 * scrolls inside its box, plain or in the safe Markdown subset
 * (utils/safe-markdown). An optional title stays on top. Fades at the top /
 * bottom edge show that there is more; links open in a new tab.
 *
 * Fonts: ui.theme body font → `styleRef` preset (settings.typography.textStyles)
 * → inline `style`. In a print render the text shrinks to fit its box (down
 * to PRINT_MIN_SCALE, never below PRINT_MIN_FONT_PX); what still does not
 * fit is clipped, with a "continued in the digital edition" line and the QR
 * code to the online reader.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { NgStyle } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import type { ScrollTextLayer, TextStyle } from '../../../../types';
import { ManifestService } from '../../../../services/manifest.service';
import { renderPlainText, renderSafeMarkdown } from '../../../../utils/safe-markdown';
import { isPrintRender } from '../../../../utils/widget-utils';
import { PrintContextService } from '../../../../services/print-context.service';
import { PrintQrComponent } from '../print-qr/print-qr.component';
import { localized, widgetRootStyles, widgetText } from '../widget-shared';

/** Reference size the `sizePt` of a text style is relative to inside a widget. */
const BASE_PT = 14;

/** Print: smallest font scale the text shrinks to before it is clipped. */
export const PRINT_MIN_SCALE = 0.6;
/** Print: never smaller than this (CSS px; 9.33 px = 7 pt at 96 dpi). */
export const PRINT_MIN_FONT_PX = 9.33;
const PRINT_SCALE_STEP = 0.05;

@Component({
  selector: 'pw-scroll-text-layer',
  standalone: true,
  imports: [NgStyle, PrintQrComponent],
  templateUrl: './scroll-text-layer.component.html',
  styleUrls: ['../widget-card.css', './scroll-text-layer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScrollTextLayerComponent implements OnChanges, AfterViewInit, OnDestroy {
  private readonly manifest = inject(ManifestService);
  private readonly translate = inject(TranslateService, { optional: true });
  private readonly printContext = inject(PrintContextService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) layer!: ScrollTextLayer;
  @Input() locale = 'en-US';
  @Input() panelId = '';

  @ViewChild('scroller') scrollerRef?: ElementRef<HTMLElement>;

  readonly print = isPrintRender();
  /** Print: font scale the text was shrunk to so it fits its box. */
  printScale = 1;
  html = '';
  atTop = true;
  atBottom = true;
  overflowing = false;
  private resize?: ResizeObserver;

  ngOnChanges(): void {
    const text = localized(this.layer?.text, this.locale);
    this.html = this.layer?.format === 'markdown' ? renderSafeMarkdown(text) : renderPlainText(text);
    queueMicrotask(() => this.measure());
  }

  ngAfterViewInit(): void {
    const el = this.scrollerRef?.nativeElement;
    if (el && typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => this.measure());
      this.resize.observe(el);
    }
    this.measure();
    // Print: fit again once the web fonts are in (their metrics differ).
    if (this.print && typeof document !== 'undefined') void document.fonts?.ready.then(() => this.measure());
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
  }

  get title(): string {
    return localized(this.layer?.title, this.locale);
  }

  get plain(): boolean {
    return this.layer?.appearance === 'plain';
  }

  get regionLabel(): string {
    return this.title || widgetText(this.translate, 'scroll_region');
  }

  get continuedText(): string {
    return widgetText(this.translate, 'continued_online');
  }

  /** Print: QR code to this panel in the online reader (null: none). */
  get printLink(): string | null {
    return this.print ? this.printContext.linkFor(this.panelId) : null;
  }

  get rootStyles(): Record<string, string> {
    return widgetRootStyles(this.layer);
  }

  /** Effective text style: styleRef preset + inline style (inline wins). */
  get textStyles(): Record<string, string> {
    const ref = this.layer?.styleRef;
    const preset = (ref ? this.manifest.getManifest()?.settings?.typography?.textStyles?.[ref] : undefined) as TextStyle | undefined;
    const style: TextStyle = { ...(preset ?? {}), ...(this.layer?.style ?? {}) };
    const out: Record<string, string> = {};
    if (style.font) out['font-family'] = `${style.font}, var(--pw-theme-font-body, Georgia, serif)`;
    if (typeof style.sizePt === 'number' && style.sizePt > 0) out['font-size'] = `${style.sizePt / BASE_PT}em`;
    if (style.color) out['color'] = style.color;
    if (style.weight) out['font-weight'] = String(style.weight);
    if (style.align) out['text-align'] = style.align;
    return out;
  }

  onScroll(): void {
    this.measure();
  }

  /**
   * Links in the text always open in a new tab (never navigate the reader
   * away). Enter on a focused link fires the same click.
   */
  @HostListener('click', ['$event'])
  onContentClick(event: MouseEvent): void {
    const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link) return;
    event.preventDefault();
    if (!this.print && typeof window !== 'undefined') {
      window.open(link.href, '_blank', 'noopener,noreferrer');
    }
  }

  /** Print: shrink the text in steps until it fits (or reaches the minimum size). */
  private fitForPrint(el: HTMLElement): void {
    const content = el.querySelector<HTMLElement>('.content');
    if (!content) return;
    // `zoom` scales the text with its own (preset / inline) size and line height.
    content.style.zoom = '1';
    const base = parseFloat(getComputedStyle(content).fontSize) || 16;
    let scale = 1;
    while (el.scrollHeight > el.clientHeight + 1 && scale > PRINT_MIN_SCALE && base * (scale - PRINT_SCALE_STEP) >= PRINT_MIN_FONT_PX) {
      scale = Math.round((scale - PRINT_SCALE_STEP) * 100) / 100;
      content.style.zoom = String(scale);
    }
    if (scale !== this.printScale) {
      this.printScale = scale;
      this.cdr.markForCheck();
    }
  }

  private measure(): void {
    const el = this.scrollerRef?.nativeElement;
    if (!el) return;
    if (this.print) this.fitForPrint(el);
    const overflowing = el.scrollHeight > el.clientHeight + 1;
    const atTop = el.scrollTop <= 1;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if (overflowing !== this.overflowing || atTop !== this.atTop || atBottom !== this.atBottom) {
      this.overflowing = overflowing;
      this.atTop = atTop;
      this.atBottom = atBottom;
      this.cdr.markForCheck();
    }
  }
}
