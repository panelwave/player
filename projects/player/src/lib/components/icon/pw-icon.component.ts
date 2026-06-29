import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { PW_ICONS } from './pw-icon.data';

/**
 * Renders an inlined Lucide icon by name (e.g. `lucideX`).
 *
 * Zero-dependency: the SVG markup lives in {@link PW_ICONS}, so the published
 * player library does not depend on an icon library. Glyphs use
 * `stroke="currentColor"` and are sized to `1em`, so colour follows CSS `color`
 * and size follows the surrounding font-size — matching the emoji they replace.
 * The host is an inline-flex box so glyphs stay vertically centred and never
 * clip at the bottom inside flex rows, buttons or menus.
 */
@Component({
  selector: 'pw-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pw-icon__svg" [innerHTML]="svg()"></span>`,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        line-height: 1;
      }

      .pw-icon__svg {
        display: inline-flex;
      }

      :host ::ng-deep svg {
        display: block;
        width: 1em;
        height: 1em;
      }
    `,
  ],
  host: {
    'aria-hidden': 'true',
  },
})
export class PwIconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  /** Lucide icon identifier, e.g. `lucideX`, `lucideSettings`. */
  readonly name = input.required<string>();

  protected readonly svg = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(PW_ICONS[this.name()] ?? ''),
  );
}
