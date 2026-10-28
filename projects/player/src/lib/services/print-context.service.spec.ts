import { PrintContextService } from './print-context.service';
import { qrModules } from '../utils/qr';

describe('PrintContextService', () => {
  let ctx: PrintContextService;

  beforeEach(() => (ctx = new PrintContextService()));

  it('links a panel in the online reader (QR codes are the default)', () => {
    ctx.configure({ linkBase: 'https://read.panelwave.org/acme/meanders' });
    expect(ctx.mode).toBe('qr');
    expect(ctx.linkFor('ch1-p008')).toBe('https://read.panelwave.org/acme/meanders?panel=ch1-p008');
  });

  it('keeps a query and a hash of the link base', () => {
    ctx.configure({ linkBase: 'https://read.panelwave.org/s/tok?lang=de#top' });
    expect(ctx.linkFor('p 1')).toBe('https://read.panelwave.org/s/tok?lang=de&panel=p%201#top');
  });

  it('has no link without a base, for cards without codes, or for a non-http base', () => {
    expect(ctx.linkFor('p1')).toBeNull();
    ctx.configure({ widgets: 'card', linkBase: 'https://x.org/w' });
    expect(ctx.linkFor('p1')).toBeNull();
    ctx.configure({ linkBase: 'javascript:alert(1)' });
    expect(ctx.linkFor('p1')).toBeNull();
  });

  it('hides a widget set to hide, or every widget in hide mode', () => {
    expect(ctx.hides({ print: 'hide' })).toBeTrue();
    expect(ctx.hides({ print: 'card' })).toBeFalse();
    expect(ctx.hides({})).toBeFalse();
    ctx.configure({ widgets: 'hide' });
    expect(ctx.hides({ print: 'card' })).toBeTrue();
  });

  it('knows the first page of an appended file', () => {
    ctx.configure({ attachments: { 'file-1': 7, bad: 0 } });
    expect(ctx.attachmentPage('file-1')).toBe(7);
    expect(ctx.attachmentPage('bad')).toBeNull();
    expect(ctx.attachmentPage('other')).toBeNull();
    expect(ctx.attachmentPage(undefined)).toBeNull();
  });

  it('qrModules encodes a URL as a square path, nothing for empty text', () => {
    const qr = qrModules('https://read.panelwave.org/acme/meanders?panel=ch1-p008', 2)!;
    expect(qr.size).toBeGreaterThan(20);
    expect(qr.path).toMatch(/^M\d+ \d+h1v1h-1z/);
    expect(qrModules('')).toBeNull();
  });
});
