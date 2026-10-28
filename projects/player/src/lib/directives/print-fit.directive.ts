/**
 * Print renders: a content widget is laid out at its design size — its box
 * in the layer reference space, 1 reference px = 1 CSS px, as panel view
 * shows it on a 1024 px tall screen — and then zoomed to the box it has on
 * the printed page. On paper a small card stays a faithful miniature (icon,
 * name, size, QR code) instead of dropping to the compact variants the
 * widgets use for small boxes on screen.
 *
 * The host is the widget's size container (`pw-widget`); its parent is the
 * layer wrapper, whose size the zoom follows.
 */
import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnChanges, OnDestroy, inject } from '@angular/core';

export interface PrintFitSize {
  /** Design width (reference px). */
  width: number;
  /** Design height (reference px). */
  height: number;
}

@Directive({
  selector: '[pwPrintFit]',
  standalone: true,
  host: { class: 'pw-print-fit' },
})
export class PrintFitDirective implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) pwPrintFit!: PrintFitSize;

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private observer?: ResizeObserver;

  ngOnChanges(): void {
    const host = this.el.nativeElement;
    host.style.width = `${this.pwPrintFit.width}px`;
    host.style.height = `${this.pwPrintFit.height}px`;
    this.fit();
  }

  ngAfterViewInit(): void {
    const parent = this.el.nativeElement.parentElement;
    if (parent && typeof ResizeObserver !== 'undefined') {
      this.zone.runOutsideAngular(() => {
        this.observer = new ResizeObserver(() => this.fit());
        this.observer.observe(parent);
      });
    }
    this.fit();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  /** Zoom factor that fits the design box into the wrapper (1 while unmeasured). */
  static zoomFor(box: { width: number; height: number }, design: PrintFitSize): number {
    if (!(box.width > 0) || !(box.height > 0) || !(design.width > 0) || !(design.height > 0)) return 1;
    return Math.min(box.width / design.width, box.height / design.height);
  }

  private fit(): void {
    const host = this.el.nativeElement;
    const parent = host.parentElement;
    if (!parent || !this.pwPrintFit) return;
    const zoom = PrintFitDirective.zoomFor({ width: parent.clientWidth, height: parent.clientHeight }, this.pwPrintFit);
    host.style.zoom = String(Math.round(zoom * 10000) / 10000);
  }
}
