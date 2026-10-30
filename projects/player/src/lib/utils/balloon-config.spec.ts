import { PAGE_LETTERING_FACTOR, pageLetteringFactor, pageLetteringScale } from './balloon-config';

describe('pageLetteringScale', () => {
  it('letters pages up to Desktop width at three quarters of panel view', () => {
    expect(PAGE_LETTERING_FACTOR).toBe(0.75);
    expect(pageLetteringScale(794)).toBeCloseTo(0.75 * 794 * 9 / 16 / 1123, 9); // A4 ≈ 0.30
    expect(pageLetteringScale(1920)).toBeCloseTo(0.75 * 1080 / 1123, 9);       // Desktop ≈ 0.72
  });

  it('eases to 0.6 for pages wider than Desktop (Bigscreen ≈ 1.15), like the CMS editor', () => {
    expect(pageLetteringFactor(2880)).toBeCloseTo(0.675, 9);
    expect(pageLetteringScale(3840)).toBeCloseTo(0.6 * 2160 / 1123, 9);
    expect(pageLetteringFactor(7680)).toBe(0.6);
  });
});
