import type { Page } from '../types';
import {
  pageAspectRatio,
  pageFormatOf,
  pageFormatsOf,
  pagesForFormat,
  pickPageFormat,
  rankPageFormats,
  screenClassFor,
} from './page-format-utils';

function page(id: string, format?: string, canvasSize?: { width: number; height: number }): Page {
  return {
    id,
    readingOrder: [],
    layout: { format, placements: [], ...(canvasSize ? { canvasSize } : {}) },
  } as unknown as Page;
}

const ALL = ['mobile-portrait', 'desktop-landscape', 'tablet-portrait', 'bigscreen-landscape', 'a4-portrait'];

describe('page-format-utils', () => {
  describe('screenClassFor', () => {
    it('classifies portrait screens by width', () => {
      expect(screenClassFor(390, 844, 3)).toBe('phone');
      expect(screenClassFor(820, 1180, 2)).toBe('tablet');
    });

    it('classifies landscape screens: desktop, and 4K as big screen at any common scaling', () => {
      expect(screenClassFor(1536, 864, 1.25)).toBe('desktop'); // 1920 laptop at 125 %
      expect(screenClassFor(1920, 1080, 1)).toBe('desktop');
      expect(screenClassFor(1728, 1117, 2)).toBe('desktop'); // MacBook Pro 16" default
      expect(screenClassFor(3840, 2160, 1)).toBe('bigscreen'); // 4K at 100 %
      expect(screenClassFor(2560, 1440, 1.5)).toBe('bigscreen'); // 4K at 150 %
      expect(screenClassFor(1920, 1080, 2)).toBe('bigscreen'); // 4K at 200 %
    });
  });

  describe('pickPageFormat', () => {
    it('shows the big-screen pages on a 4K screen', () => {
      expect(pickPageFormat(ALL, 2560, 1440, 1.5)).toBe('bigscreen-landscape');
    });

    it('shows the desktop pages on a desktop and the mobile pages on a phone', () => {
      expect(pickPageFormat(ALL, 1920, 1080, 1)).toBe('desktop-landscape');
      expect(pickPageFormat(ALL, 390, 844, 3)).toBe('mobile-portrait');
      expect(pickPageFormat(ALL, 820, 1180, 2)).toBe('tablet-portrait');
    });

    it('falls back along the preference list when the ideal format is missing', () => {
      expect(pickPageFormat(['desktop-landscape', 'mobile-portrait'], 3840, 2160, 1)).toBe('desktop-landscape');
      expect(pickPageFormat(['bigscreen-landscape', 'a4-portrait'], 1920, 1080, 1)).toBe('bigscreen-landscape');
      expect(pickPageFormat(['a4-portrait'], 1920, 1080, 1)).toBe('a4-portrait');
    });

    it('honors a host override when pages exist for it', () => {
      expect(pickPageFormat(ALL, 1920, 1080, 1, 'a4-portrait')).toBe('a4-portrait');
      expect(pickPageFormat(ALL, 1920, 1080, 1, 'square')).toBe('desktop-landscape');
    });

    it('is null without formats', () => {
      expect(pickPageFormat([], 1920, 1080)).toBeNull();
    });
  });

  it('rankPageFormats puts formats it does not know last, closest aspect first', () => {
    expect(rankPageFormats(['x-tall', 'desktop-landscape', 'x-wide'], 'desktop')).toEqual([
      'desktop-landscape',
      'x-tall',
      'x-wide',
    ]);
  });

  it('pageFormatsOf lists distinct formats in first-seen order', () => {
    expect(pageFormatsOf([page('1', 'mobile-portrait'), page('2', 'desktop-landscape'), page('3', 'mobile-portrait'), page('4')])).toEqual([
      'mobile-portrait',
      'desktop-landscape',
    ]);
    expect(pageFormatOf(page('4'))).toBeNull();
  });

  it('pagesForFormat keeps one sequence plus legacy pages without a format', () => {
    const pages = [page('M1', 'mobile-portrait'), page('D1', 'desktop-landscape'), page('L', undefined), page('D2', 'desktop-landscape')];
    expect(pagesForFormat(pages, 'desktop-landscape').map((p) => p.id)).toEqual(['D1', 'L', 'D2']);
    expect(pagesForFormat(pages, null).map((p) => p.id)).toEqual(['M1', 'D1', 'L', 'D2']);
    expect(pagesForFormat(undefined, 'x')).toEqual([]);
  });

  it('pageAspectRatio uses the canvas size, else the format, else 16:9', () => {
    expect(pageAspectRatio(page('a', 'mobile-portrait', { width: 400, height: 800 }))).toBe(0.5);
    expect(pageAspectRatio(page('b', 'a4-portrait'))).toBeCloseTo(794 / 1123, 5);
    expect(pageAspectRatio(page('c', 'bigscreen-landscape'))).toBeCloseTo(16 / 9, 5);
    expect(pageAspectRatio(null)).toBeCloseTo(16 / 9, 5);
  });
});
