import { ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import {
  panelBorderClipPath,
  panelBorderShape,
  type PanelBorderShape,
  type ResolvedPanelBorder,
} from '../../utils/panel-border';

const EMPTY_SHAPE: PanelBorderShape = { strokes: [], clip: { kind: 'none' } };

/**
 * The line around a panel (format 1.14.0, `Panel.border` over the work's
 * `settings.typography.panel_border_style`). Place it as the last child of
 * the panel's positioned frame element (page view `.panel-container`, panel
 * view `.panel-container`, canvas `.canvas-panel`): it fills the frame with
 * an SVG drawn in frame px (`width × height`, the page's output-format frame)
 * that the viewBox scales with the page, above the artwork and the balloons.
 *
 * It also owns the frame's outline: for a corner radius, `rough` and `wavy`
 * it sets the frame element's `clip-path` (and clears it again when the
 * outline is straight or the component goes away), so the artwork ends at the
 * line.
 */
@Component({
  selector: 'pw-panel-border',
  template: `
    @if (shape.strokes.length) {
      <svg
        class="pw-panel-border-svg"
        [attr.viewBox]="viewBox"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false">
        @for (stroke of shape.strokes; track $index) {
          <path
            fill="none"
            [attr.d]="stroke.d"
            [attr.stroke]="color"
            [attr.stroke-width]="stroke.width"
            [attr.stroke-dasharray]="stroke.dash ? stroke.dash.join(' ') : null"
            [attr.stroke-linecap]="stroke.cap"
            [attr.stroke-linejoin]="stroke.join" />
        }
      </svg>
    }
  `,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        display: block;
        pointer-events: none;
        /* Above layers (auto), hotspots (15) and balloons (20). */
        z-index: 30;
      }
      .pw-panel-border-svg {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelBorderComponent implements OnChanges, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** The resolved border (resolvePanelBorder); null draws nothing. */
  @Input() border: ResolvedPanelBorder | null = null;
  /** Frame width in frame px. */
  @Input() width = 0;
  /** Frame height in frame px. */
  @Input() height = 0;
  /** Panel id: seeds the `rough` line. */
  @Input() seed = '';

  shape: PanelBorderShape = EMPTY_SHAPE;
  viewBox = '0 0 1 1';
  color = '#000000';

  private key = '';
  /** The clip-path this component set on its frame ('' = none). */
  private appliedClip = '';
  /** The frame element that clip was set on (the host is detached before ngOnDestroy). */
  private frame: HTMLElement | null = null;

  ngOnChanges(): void {
    const b = this.border;
    const w = Number.isFinite(this.width) ? this.width : 0;
    const h = Number.isFinite(this.height) ? this.height : 0;
    // Inputs are rebuilt on every check; recompute only when something changed.
    const key = b ? `${b.style}|${b.thickness}|${b.radius}|${b.color}|${w}|${h}|${this.seed}` : '';
    if (key === this.key) return;
    this.key = key;
    if (!b || !(w > 0) || !(h > 0)) {
      this.shape = EMPTY_SHAPE;
      this.applyClip('');
      return;
    }
    this.shape = panelBorderShape(b, w, h, this.seed);
    this.viewBox = `0 0 ${w} ${h}`;
    this.color = b.color;
    this.applyClip(panelBorderClipPath(this.shape.clip, w, h) ?? '');
  }

  ngOnDestroy(): void {
    this.applyClip('');
  }

  private applyClip(clip: string): void {
    if (clip === this.appliedClip) return;
    const frame = this.frame ?? (this.host.nativeElement as HTMLElement).parentElement;
    if (!frame) return;
    frame.style.clipPath = clip;
    this.frame = frame;
    this.appliedClip = clip;
  }
}
