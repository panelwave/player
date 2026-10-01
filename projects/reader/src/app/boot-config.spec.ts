import { readBootConfig } from './boot-config';

function fakeWin(search: string, injected?: unknown): Window {
  return { location: { search }, __PW_READER__: injected } as unknown as Window;
}

describe('readBootConfig', () => {
  it('reads the server-injected window config', () => {
    const cfg = readBootConfig(
      fakeWin('', {
        manifestUrl: '/api/public/read/t/w/manifest',
        embed: true,
        locale: 'de-DE',
        mode: 'review',
      })
    );
    expect(cfg).toEqual({
      manifestUrl: '/api/public/read/t/w/manifest',
      embed: true,
      locale: 'de-DE',
      mode: 'review',
    });
  });

  it("defaults the mode to 'read' and ignores unknown modes", () => {
    expect(readBootConfig(fakeWin('', { manifestUrl: 'i.json' })).mode).toBe('read');
    expect(readBootConfig(fakeWin('', { manifestUrl: 'i.json', mode: 'admin' })).mode).toBe('read');
  });

  it('ignores an injected title (the server renders <title>)', () => {
    expect(readBootConfig(fakeWin('', { manifestUrl: 'i.json', title: 'Work' }))).toEqual({
      manifestUrl: 'i.json',
      embed: false,
      mode: 'read',
    });
  });

  it('falls back to ?manifest= and ?embed=1', () => {
    expect(
      readBootConfig(fakeWin('?manifest=http%3A%2F%2Fx%2Fm.json&embed=1'), { allowQuery: true })
    ).toEqual({
      manifestUrl: 'http://x/m.json',
      embed: true,
      mode: 'read',
    });
    expect(readBootConfig(fakeWin('?manifest=a.json'), { allowQuery: true }).embed).toBeFalse();
    expect(readBootConfig(fakeWin('?manifest=a.json&mode=review'), { allowQuery: true }).mode).toBe(
      'review'
    );
  });

  it('prefers the injected config over the query', () => {
    expect(
      readBootConfig(fakeWin('?manifest=q.json', { manifestUrl: 'i.json', embed: false }))
        .manifestUrl
    ).toBe('i.json');
  });

  it('ignores the query string when query fallback is disallowed (production)', () => {
    expect(
      readBootConfig(fakeWin('?manifest=q.json&embed=1&locale=de-DE&mode=review'), {
        allowQuery: false,
      })
    ).toEqual({
      manifestUrl: '',
      embed: false,
      mode: 'read',
    });
  });

  it('defaults the query fallback to dev mode (specs run in dev mode)', () => {
    expect(readBootConfig(fakeWin('?manifest=q.json')).manifestUrl).toBe('q.json');
  });

  it('returns an empty manifestUrl when nothing is configured', () => {
    expect(readBootConfig(fakeWin(''))).toEqual({ manifestUrl: '', embed: false, mode: 'read' });
    expect(readBootConfig(fakeWin('', {})).manifestUrl).toBe('');
  });
});
