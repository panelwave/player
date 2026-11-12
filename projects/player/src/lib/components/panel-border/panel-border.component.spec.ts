import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PanelBorderComponent } from './panel-border.component';
import { DEFAULT_PANEL_BORDER, type ResolvedPanelBorder } from '../../utils/panel-border';

@Component({
  imports: [PanelBorderComponent],
  template: `
    <div class="frame" style="position: relative; width: 400px; height: 200px">
      @if (shown) {
        <pw-panel-border [border]="border" [width]="width" [height]="height" seed="p1"></pw-panel-border>
      }
    </div>
  `,
})
class HostComponent {
  border: ResolvedPanelBorder | null = { ...DEFAULT_PANEL_BORDER };
  width = 400;
  height = 200;
  shown = true;
}

describe('PanelBorderComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const frame = (): HTMLElement => fixture.nativeElement.querySelector('.frame');
  const paths = (): SVGPathElement[] => Array.from(fixture.nativeElement.querySelectorAll('pw-panel-border path'));

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  function set(patch: Partial<HostComponent>): void {
    Object.assign(host, patch);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  it('draws the default border as one black line inside the frame, in frame px', () => {
    const svg = fixture.nativeElement.querySelector('pw-panel-border svg') as SVGSVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 200');
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
    expect(paths().length).toBe(1);
    expect(paths()[0].getAttribute('d')).toBe('M1 1H399V199H1Z');
    expect(paths()[0].getAttribute('stroke')).toBe('#000000');
    expect(paths()[0].getAttribute('stroke-width')).toBe('2');
    expect(paths()[0].getAttribute('stroke-dasharray')).toBeNull();
    expect(frame().style.clipPath).toBe('');
  });

  it('draws nothing for thickness 0 or style none', () => {
    set({ border: { ...DEFAULT_PANEL_BORDER, thickness: 0 } });
    expect(fixture.nativeElement.querySelector('pw-panel-border svg')).toBeNull();
    set({ border: { ...DEFAULT_PANEL_BORDER, style: 'none' } });
    expect(fixture.nativeElement.querySelector('pw-panel-border svg')).toBeNull();
  });

  it('draws dashes and double lines', () => {
    set({ border: { ...DEFAULT_PANEL_BORDER, style: 'dashed' } });
    expect(paths()[0].getAttribute('stroke-dasharray')).toBe('6 4');
    set({ border: { ...DEFAULT_PANEL_BORDER, style: 'double' } });
    expect(paths().length).toBe(2);
  });

  it('rounds the frame for a radius and clears the clip again', () => {
    set({ border: { ...DEFAULT_PANEL_BORDER, radius: 20 } });
    expect(frame().style.clipPath).toContain('inset(0');
    set({ border: { ...DEFAULT_PANEL_BORDER, radius: 0 } });
    expect(frame().style.clipPath).toBe('');
  });

  it('clips the frame to a rough outline and releases it when removed', () => {
    set({ border: { ...DEFAULT_PANEL_BORDER, style: 'rough' } });
    expect(frame().style.clipPath).toContain('polygon(');
    expect(paths()[0].getAttribute('stroke-width')).toBe('4');
    set({ shown: false });
    expect(frame().style.clipPath).toBe('');
  });

  it('draws nothing before the frame is measured', () => {
    set({ width: 0 });
    expect(fixture.nativeElement.querySelector('pw-panel-border svg')).toBeNull();
  });
});
