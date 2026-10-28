/**
 * QR code on a content widget's print card: black on white with a quiet
 * zone, square, as tall as the card allows. `label` names what the code
 * does ("Scan to listen") under it when there is room.
 */
import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { qrModules } from '../../../../utils/qr';

@Component({
  selector: 'pw-print-qr',
  standalone: true,
  host: { '[attr.data-href]': 'value' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (size) {
      <!-- A link too: in the PDF the code is clickable when it is read on screen. -->
      <a class="code-link" [attr.href]="value" target="_blank" rel="noopener">
        <svg class="code" [attr.viewBox]="'0 0 ' + size + ' ' + size" role="img" [attr.aria-label]="label || value" shape-rendering="crispEdges">
          <rect [attr.width]="size" [attr.height]="size" fill="#fff" />
          <path [attr.d]="path" fill="#000" />
        </svg>
      </a>
      @if (label) {
        <span class="label">{{ label }}</span>
      }
    }
  `,
  styles: [`
    :host {
      flex: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.15em;
      height: 100%;
      max-height: 100%;
      aspect-ratio: 0.82;
      min-width: 0;
    }
    .code-link {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      justify-content: center;
    }
    .code {
      height: 100%;
      min-height: 0;
      aspect-ratio: 1;
      max-width: 100%;
      display: block;
      background: #fff;
      border-radius: 2px;
    }
    .label {
      flex: none;
      max-width: 100%;
      font-size: 0.62em;
      line-height: 1.15;
      text-align: center;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--pw-theme-on-surface-muted, #d1d5db);
    }
    /* Short cards: the code alone. */
    @container pw-widget (max-height: 90px) {
      :host { aspect-ratio: 1; }
      .label { display: none; }
    }
  `],
})
export class PrintQrComponent implements OnChanges {
  @Input({ required: true }) value = '';
  @Input() label = '';

  path = '';
  size = 0;

  ngOnChanges(): void {
    const qr = qrModules(this.value, 2);
    this.path = qr?.path ?? '';
    this.size = qr?.size ?? 0;
  }
}
