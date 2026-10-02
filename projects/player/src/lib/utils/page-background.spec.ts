import type { Page, Settings } from '../types';
import { DEFAULT_PAGE_BACKGROUND, resolvePageBackground } from './page-background';

describe('resolvePageBackground', () => {
  const page = (background_color?: string): Page =>
    ({ id: 'p1', layout: { format: 'desktop-landscape', placements: [] }, readingOrder: [], visual: { background_color } }) as unknown as Page;
  const settings = (default_page_bg_color?: string): Settings =>
    ({ typography: { default_page_bg_color } }) as Settings;

  it('uses the page color first', () => {
    expect(resolvePageBackground(page('#000000'), settings('#FFFFFF'))).toBe('#000000');
  });

  it('falls back to the work default page color', () => {
    expect(resolvePageBackground(page(), settings('#FFF8E1'))).toBe('#FFF8E1');
  });

  it('falls back to the player default without page or work color', () => {
    expect(resolvePageBackground(page(), null)).toBe(DEFAULT_PAGE_BACKGROUND);
    expect(resolvePageBackground(null, undefined)).toBe(DEFAULT_PAGE_BACKGROUND);
  });

  it('skips values that are not hex colors', () => {
    expect(resolvePageBackground(page('red; background: url(x)'), settings('#123'))).toBe('#123');
    expect(resolvePageBackground(page(''), settings('nope'))).toBe(DEFAULT_PAGE_BACKGROUND);
  });
});
