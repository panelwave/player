import { locationUrl, parseLocationSearch } from './player-location';

describe('player location URLs', () => {
  describe('parseLocationSearch', () => {
    it('reads a page or a panel link', () => {
      expect(parseLocationSearch('?page=pg-D3')).toEqual({ pageId: 'pg-D3' });
      expect(parseLocationSearch('?panel=ch1-p022&embed=1')).toEqual({ panelId: 'ch1-p022' });
    });

    it('prefers the page and ignores what is not an id', () => {
      expect(parseLocationSearch('?panel=ch1-p001&page=pg-A2')).toEqual({ pageId: 'pg-A2' });
      expect(parseLocationSearch('?panel=%3Cscript%3E')).toEqual({});
      expect(parseLocationSearch('')).toEqual({});
    });
  });

  describe('locationUrl', () => {
    const base = 'https://read.panelwave.org/team/work';

    it('gives page view and panel view their own URLs', () => {
      expect(locationUrl(base, { view: 'page', pageId: 'pg-D3', panelId: 'ch1-p010' })).toBe(`${base}?page=pg-D3`);
      expect(locationUrl(base, { view: 'panel', panelId: 'ch1-p022' })).toBe(`${base}?panel=ch1-p022`);
      expect(locationUrl(base, { view: 'canvas', panelId: 'ch1-p022' })).toBe(`${base}?panel=ch1-p022`);
    });

    it('drops the position on the cover and keeps other parameters', () => {
      expect(locationUrl(`${base}?embed=1&page=pg-D3`, { view: 'cover', panelId: 'ch1-p001' })).toBe(`${base}?embed=1`);
      expect(locationUrl(`${base}?embed=1#x`, { view: 'panel', panelId: 'p' })).toBe(`${base}?embed=1&panel=p`);
    });

    it('removes the parameters it is told to drop', () => {
      expect(locationUrl(`${base}?embed=1`, { view: 'panel', panelId: 'p' }, ['embed'])).toBe(`${base}?panel=p`);
    });
  });
});
