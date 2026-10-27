import {
  EMBED_PROTOCOL_VERSION,
  hostOriginFromSearch,
  isEmbedInboundMessage,
  manifestFingerprint,
  pickLocalized,
  sameVariableValue,
  normalizeOrigin,
  parseChapterRef,
  parseEmbedFlag,
  parseSecondsPerPanel,
} from './embed-protocol';

describe('embed bridge protocol helpers', () => {
  it('is protocol version 3', () => {
    expect(EMBED_PROTOCOL_VERSION).toBe(3);
  });

  it('knows the v3 setTheme message', () => {
    expect(isEmbedInboundMessage({ type: 'setTheme', theme: { mode: 'light' } })).toBeTrue();
  });

  it('knows the v2 hostGesture message', () => {
    expect(isEmbedInboundMessage({ type: 'hostGesture' })).toBeTrue();
  });

  describe('normalizeOrigin', () => {
    it('keeps http(s) origins only', () => {
      expect(normalizeOrigin('https://a.example/x?y=1')).toBe('https://a.example');
      expect(normalizeOrigin('http://localhost:4200')).toBe('http://localhost:4200');
      expect(normalizeOrigin('file:///c/x.html')).toBeNull();
      expect(normalizeOrigin('javascript:alert(1)')).toBeNull();
      expect(normalizeOrigin('nonsense')).toBeNull();
      expect(normalizeOrigin(null)).toBeNull();
    });
  });

  describe('URL parameter parsers', () => {
    it('reads flags', () => {
      expect(parseEmbedFlag('1')).toBeTrue();
      expect(parseEmbedFlag('true')).toBeTrue();
      expect(parseEmbedFlag('0')).toBeFalse();
      expect(parseEmbedFlag('false')).toBeFalse();
      expect(parseEmbedFlag('maybe')).toBeUndefined();
      expect(parseEmbedFlag(null)).toBeUndefined();
    });

    it('reads chapter references', () => {
      expect(parseChapterRef('ch-2')).toBe('ch-2');
      expect(parseChapterRef('7c1e0000-0000-4000-8000-000000000002')).toBe('7c1e0000-0000-4000-8000-000000000002');
      expect(parseChapterRef('<script>')).toBeUndefined();
      expect(parseChapterRef('')).toBeUndefined();
      expect(parseChapterRef(3)).toBeUndefined();
    });

    it('reads seconds per panel within 0.5–120', () => {
      expect(parseSecondsPerPanel('4')).toBe(4);
      expect(parseSecondsPerPanel(0.5)).toBe(0.5);
      expect(parseSecondsPerPanel('0.1')).toBeUndefined();
      expect(parseSecondsPerPanel('500')).toBeUndefined();
      expect(parseSecondsPerPanel('x')).toBeUndefined();
      expect(parseSecondsPerPanel('')).toBeUndefined();
    });
  });

  describe('hostOriginFromSearch', () => {
    it('takes a valid ?origin= and normalizes it to an origin', () => {
      expect(hostOriginFromSearch('?embed=1&origin=' + encodeURIComponent('https://app.panelwave.org/backstage/x'), 'http://self')).toBe(
        'https://app.panelwave.org'
      );
      expect(hostOriginFromSearch('?origin=http%3A%2F%2Flocalhost%3A4200', 'http://self')).toBe('http://localhost:4200');
    });

    it('falls back to the own origin without or with an invalid ?origin= (never "*")', () => {
      expect(hostOriginFromSearch('?embed=1', 'http://self')).toBe('http://self');
      expect(hostOriginFromSearch('?origin=*', 'http://self')).toBe('http://self');
      expect(hostOriginFromSearch('?origin=not-a-url', 'http://self')).toBe('http://self');
      expect(hostOriginFromSearch('?origin=', 'http://self')).toBe('http://self');
    });
  });

  describe('manifestFingerprint', () => {
    it('is stable for equal manifests and differs when the content changes', () => {
      const a = { meta: { id: 'w' }, chapters: [{ id: 'c1', panels: { p1: { layers: [] } } }] };
      const b = JSON.parse(JSON.stringify(a));
      expect(manifestFingerprint(a)).toBe(manifestFingerprint(b));
      b.chapters[0].panels.p1.layers.push({ id: 'l1' });
      expect(manifestFingerprint(a)).not.toBe(manifestFingerprint(b));
    });
  });

  describe('isEmbedInboundMessage', () => {
    it('accepts the protocol types only', () => {
      expect(isEmbedInboundMessage({ type: 'config', data: {} })).toBeTrue();
      expect(isEmbedInboundMessage({ type: 'navigate', panelId: 'p1' })).toBeTrue();
      expect(isEmbedInboundMessage({ type: 'getState' })).toBeTrue();
      expect(isEmbedInboundMessage({ type: 'restart' })).toBeTrue();
      expect(isEmbedInboundMessage({ type: 'webpackOk' })).toBeFalse();
      expect(isEmbedInboundMessage('config')).toBeFalse();
      expect(isEmbedInboundMessage(null)).toBeFalse();
    });
  });

  it('compares variable values structurally', () => {
    expect(sameVariableValue(1, 1)).toBeTrue();
    expect(sameVariableValue({ a: [1] }, { a: [1] })).toBeTrue();
    expect(sameVariableValue({ a: [1] }, { a: [2] })).toBeFalse();
    expect(sameVariableValue(undefined, null)).toBeFalse();
  });

  it('picks a localized string with en-US and first-value fallbacks', () => {
    expect(pickLocalized({ 'de-DE': 'Hallo', 'en-US': 'Hello' }, 'de-DE')).toBe('Hallo');
    expect(pickLocalized({ 'de-DE': 'Hallo', 'en-US': 'Hello' }, 'fr-FR')).toBe('Hello');
    expect(pickLocalized({ 'de-DE': 'Hallo' }, 'fr-FR')).toBe('Hallo');
    expect(pickLocalized(undefined, 'en-US')).toBeUndefined();
  });
});
