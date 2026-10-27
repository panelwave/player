import { readBootConfig, readEmbedOptions } from './boot-config';

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

describe('readEmbedOptions', () => {
  it('is empty without embed options', () => {
    expect(readEmbedOptions(fakeWin('', { manifestUrl: 'i.json' }))).toEqual({});
  });

  it('reads the injected options', () => {
    expect(
      readEmbedOptions(
        fakeWin('', {
          manifestUrl: 'i.json',
          chapter: 'ch-2',
          autoplay: true,
          showToolbar: false,
          showCover: false,
          secondsPerPanel: 4,
          embedOrigin: 'https://course.example/lesson-1',
        })
      )
    ).toEqual({
      chapter: 'ch-2',
      autoplay: true,
      showToolbar: false,
      showCover: false,
      secondsPerPanel: 4,
      embedOrigin: 'https://course.example',
    });
  });

  it('falls back to the URL (production too: display options only)', () => {
    expect(
      readEmbedOptions(fakeWin('?chapter=7c1e0000-0000-4000-8000-000000000002&autoplay=1&toolbar=0&cover=0&spp=3&origin=https%3A%2F%2Fa.example'))
    ).toEqual({
      chapter: '7c1e0000-0000-4000-8000-000000000002',
      autoplay: true,
      showToolbar: false,
      showCover: false,
      secondsPerPanel: 3,
      embedOrigin: 'https://a.example',
    });
  });

  it('lets injected values win and drops malformed ones', () => {
    const options = readEmbedOptions(
      fakeWin('?chapter=url-ch&autoplay=1&origin=javascript%3Aalert(1)&spp=999', { manifestUrl: 'i.json', chapter: 'inj', autoplay: false })
    );
    expect(options).toEqual({ chapter: 'inj', autoplay: false });
  });
});
