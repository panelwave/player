import { PrintFitDirective } from './print-fit.directive';

describe('PrintFitDirective', () => {
  it('zooms the design box uniformly into the printed box', () => {
    expect(PrintFitDirective.zoomFor({ width: 180, height: 48 }, { width: 360, height: 96 })).toBe(0.5);
    // A box of another shape: the tighter side wins (no overflow).
    expect(PrintFitDirective.zoomFor({ width: 180, height: 96 }, { width: 360, height: 96 })).toBe(0.5);
  });

  it('keeps 1 while the box is not measured', () => {
    expect(PrintFitDirective.zoomFor({ width: 0, height: 0 }, { width: 360, height: 96 })).toBe(1);
    expect(PrintFitDirective.zoomFor({ width: 100, height: 50 }, { width: 0, height: 96 })).toBe(1);
  });
});
