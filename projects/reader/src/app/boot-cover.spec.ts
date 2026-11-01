import { BOOT_COVER_ID, releaseBootCover, removeBootCover } from './boot-cover';

describe('boot cover', () => {
  let host: HTMLElement;

  const boot = (): HTMLElement => {
    const el = document.createElement('div');
    el.id = BOOT_COVER_ID;
    document.body.appendChild(el);
    return el;
  };
  const present = (): boolean => !!document.getElementById(BOOT_COVER_ID);

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    removeBootCover(document);
  });

  it('removeBootCover removes it at once, and is a no-op without one', () => {
    boot();
    removeBootCover(document);
    expect(present()).toBeFalse();
    expect(() => removeBootCover(document)).not.toThrow();
  });

  it('stays until the player opens somewhere other than the cover', async () => {
    boot();
    releaseBootCover(document, 5000);
    expect(present()).toBeTrue();
    host.appendChild(document.createElement('pw-viewport'));
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver callback
    expect(present()).toBeFalse();
  });

  it('stays until the player cover image has loaded, then leaves after paint', async () => {
    boot();
    releaseBootCover(document, 5000);
    const img = document.createElement('img');
    img.className = 'pw-cover-image';
    host.appendChild(img);
    await new Promise((r) => setTimeout(r, 0));
    expect(present()).toBeTrue(); // not loaded yet
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    await new Promise((r) => img.addEventListener('load', r, { once: true }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
    expect(present()).toBeFalse();
  });

  it('leaves after the timeout at the latest', () => {
    jasmine.clock().install();
    try {
      boot();
      releaseBootCover(document, 1000);
      jasmine.clock().tick(999);
      expect(present()).toBeTrue();
      jasmine.clock().tick(1);
      expect(present()).toBeFalse();
    } finally {
      jasmine.clock().uninstall();
    }
  });
});
