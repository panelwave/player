import {
  checkIframeUrl,
  displayHost,
  fileExtensionOf,
  fileTypeInfo,
  formatBytes,
  formatMediaTime,
  iframeAllowValue,
  iframeSandboxValue,
  isLayerVisible,
} from './widget-utils';

describe('widget-utils', () => {
  describe('isLayerVisible', () => {
    it('shows layers without visibleIf or without a context', () => {
      expect(isLayerVisible({}, { a: 1 })).toBeTrue();
      expect(isLayerVisible({ visibleIf: { '==': [1, 2] } }, null)).toBeTrue();
    });

    it('evaluates visibleIf against the context', () => {
      const layer = { visibleIf: { '!': { var: 'global.offline' } } };
      expect(isLayerVisible(layer, { global: { offline: false } })).toBeTrue();
      expect(isLayerVisible(layer, { global: { offline: true } })).toBeFalse();
    });
  });

  describe('fileTypeInfo', () => {
    it('maps MIME types', () => {
      expect(fileTypeInfo('application/pdf', 'x.pdf')).toEqual(jasmine.objectContaining({ kind: 'pdf', label: 'PDF' }));
      expect(fileTypeInfo('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'a.docx').kind).toBe('word');
      expect(fileTypeInfo('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx').kind).toBe('excel');
      expect(fileTypeInfo('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'a.pptx').kind).toBe('powerpoint');
      expect(fileTypeInfo('application/zip', 'a.zip').kind).toBe('archive');
    });

    it('falls back to the extension and to generic', () => {
      expect(fileTypeInfo(undefined, 'Notes.ODT').kind).toBe('word');
      expect(fileTypeInfo('application/octet-stream', 'data.csv').kind).toBe('excel');
      const generic = fileTypeInfo(null, 'noext');
      expect(generic.kind).toBe('generic');
      expect(generic.label).toBe('FILE');
    });

    it('limits the label to four characters', () => {
      expect(fileTypeInfo(null, 'a.markdown').label).toBe('MARK');
    });
  });

  it('fileExtensionOf handles paths, queries and dotfiles', () => {
    expect(fileExtensionOf('https://cdn.org/a/b.PDF?sig=1#x')).toBe('pdf');
    expect(fileExtensionOf('.env')).toBe('');
    expect(fileExtensionOf('file.')).toBe('');
    expect(fileExtensionOf(undefined)).toBe('');
  });

  describe('formatBytes', () => {
    it('uses binary steps and locale digits', () => {
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(482133)).toBe('471 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1.4 * 1024 * 1024, 'de-DE')).toBe('1,4 MB');
    });

    it('is empty for unknown sizes', () => {
      expect(formatBytes(undefined)).toBe('');
      expect(formatBytes(-1)).toBe('');
      expect(formatBytes(NaN)).toBe('');
    });
  });

  it('formatMediaTime formats m:ss and h:mm:ss', () => {
    expect(formatMediaTime(0)).toBe('0:00');
    expect(formatMediaTime(65.9)).toBe('1:05');
    expect(formatMediaTime(3725)).toBe('1:02:05');
    expect(formatMediaTime(NaN)).toBe('0:00');
    expect(formatMediaTime(Infinity)).toBe('0:00');
  });

  describe('iframes', () => {
    it('accepts only https and never the own origin', () => {
      expect(checkIframeUrl('https://example.org/x')).toBe('ok');
      expect(checkIframeUrl('http://example.org/x')).toBe('insecure');
      expect(checkIframeUrl('javascript:alert(1)')).toBe('insecure');
      expect(checkIframeUrl('data:text/html,x')).toBe('insecure');
      expect(checkIframeUrl('not a url')).toBe('invalid');
      expect(checkIframeUrl('')).toBe('invalid');
      expect(checkIframeUrl('https://read.panelwave.org/x', 'https://read.panelwave.org')).toBe('same-origin');
    });

    it('maps sandbox presets', () => {
      expect(iframeSandboxValue('default')).toContain('allow-same-origin');
      expect(iframeSandboxValue(undefined)).toContain('allow-scripts');
      expect(iframeSandboxValue('strict')).toBe('allow-scripts');
      expect(iframeSandboxValue('none')).toBeNull();
    });

    it('keeps only allowed permissions', () => {
      expect(iframeAllowValue(['fullscreen', 'camera', 'autoplay'])).toBe('fullscreen; autoplay');
      expect(iframeAllowValue(undefined)).toBe('');
    });

    it('displayHost strips www', () => {
      expect(displayHost('https://www.openstreetmap.org/export')).toBe('openstreetmap.org');
      expect(displayHost('nope')).toBe('');
    });
  });
});
