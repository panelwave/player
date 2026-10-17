import {
  EMBED_PROTOCOL_VERSION,
  hostOriginFromSearch,
  isEmbedInboundMessage,
  manifestFingerprint,
  pickLocalized,
  sameVariableValue,
} from './embed-bridge';

describe('embed bridge protocol helpers', () => {
  it('is protocol version 1', () => {
    expect(EMBED_PROTOCOL_VERSION).toBe(1);
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
