/**
 * Print render options (the standalone player's `print` boot config, used by
 * the CMS PDF export). Content widgets cannot be used on paper; in a print
 * render they show a static card (schema 1.10 `print: "card"`, the default)
 * or are left out (`print: "hide"`).
 *
 * - `widgets`: `qr` — cards with a QR code that opens the widget's panel in
 *   the online reader (needs `linkBase`); `card` — cards without a code;
 *   `hide` — every widget left out, whatever its own setting.
 * - `linkBase`: the work's reader URL; a card links `linkBase?panel=<id>`.
 * - `attachments`: catalog file id → first page number of that file appended
 *   to the PDF; its download card says "Printed on page N".
 */
import { Injectable } from '@angular/core';
import type { WidgetLayerBase } from '../types';

export type PrintWidgetMode = 'qr' | 'card' | 'hide';

export interface PrintOptions {
  widgets?: PrintWidgetMode;
  linkBase?: string;
  attachments?: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class PrintContextService {
  private options: PrintOptions = {};

  configure(options: PrintOptions | null | undefined): void {
    this.options = { ...(options ?? {}) };
  }

  get mode(): PrintWidgetMode {
    return this.options.widgets ?? 'qr';
  }

  /** The widget is left out of the print render. */
  hides(layer: Pick<WidgetLayerBase, 'print'> | null | undefined): boolean {
    return this.mode === 'hide' || layer?.print === 'hide';
  }

  /** Where a print card's QR code leads (the panel in the online reader), or null for no code. */
  linkFor(panelId: string | null | undefined): string | null {
    const base = this.options.linkBase;
    if (this.mode !== 'qr' || !base || !panelId || !/^https?:\/\//i.test(base)) return null;
    const [path, hash = ''] = base.split('#', 2);
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}panel=${encodeURIComponent(panelId)}${hash ? '#' + hash : ''}`;
  }

  /** First page of an attached file in the printed document, or null. */
  attachmentPage(assetId: unknown): number | null {
    if (typeof assetId !== 'string') return null;
    const page = this.options.attachments?.[assetId];
    return typeof page === 'number' && Number.isInteger(page) && page > 0 ? page : null;
  }
}
