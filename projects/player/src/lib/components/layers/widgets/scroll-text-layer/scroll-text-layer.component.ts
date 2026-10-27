/**
 * Scroll text layer (schema 1.10+ `kind: "scrollText"`): longer text that
 * scrolls inside its box, plain or in the safe Markdown subset
 * (utils/safe-markdown). An optional title stays on top. Fades at the top /
 * bottom edge show that there is more; links open in a new tab.
 *
 * Fonts: ui.theme body font → `styleRef` preset (settings.typography.textStyles)
 * → inline `style`. In a print render the box is clipped with a fade and a
 * "continued in the digital edition" line when the text does not fit.
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
import { localized, widgetRootStyles, widgetText } from '../widget-shared';

/** Reference size the `sizePt` of a text style is relative to inside a widget. */
const BASE_PT = 14;

@Component({
  selector: 'pw-scroll-text-layer',
  standalone: true,
  imports: [NgStyle],
  templateUrl: './scroll-text-layer.component.html',
  styleUrls: ['../widget-card.css', './scroll-text-layer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScrollTextLayerComponent implements OnChanges, AfterViewInit, OnDestroy {
  private readonly manifest = inject(ManifestService);
  private readonly translate = inject(TranslateService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);

  @Input({ required: true }) layer!: ScrollTextLayer;
  @Input() locale = 'en-US';

  @ViewChild('scroller') scrollerRef?: ElementRef<HTMLElement>;

  readonly print = isPrintRender();
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

  private measure(): void {
    const el = this.scrollerRef?.nativeElement;
    if (!el) return;
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
