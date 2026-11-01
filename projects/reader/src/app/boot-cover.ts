/**
 * The boot cover: the public reader server draws the work's cover as plain
 * HTML (`#pw-boot-cover`, same srcset/sizes and box as the player's cover)
 * so a phone paints it while the app still boots (mobile LCP). It sits on
 * top of the app without catching taps and goes away once the player's own
 * cover has painted — or at once when there is nothing to hand over to
 * (error, empty), and after `timeoutMs` at the latest.
 */
export const BOOT_COVER_ID = 'pw-boot-cover';

/** Remove the boot cover now. */
export function removeBootCover(doc: Document): void {
  doc.getElementById(BOOT_COVER_ID)?.remove();
}

/** Remove the boot cover once the player shows its cover (or anything else). */
export function releaseBootCover(doc: Document, timeoutMs = 8000): void {
  const boot = doc.getElementById(BOOT_COVER_ID);
  if (!boot) return;
  const win = doc.defaultView;
  let finished = false;
  let observer: MutationObserver | undefined;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    observer?.disconnect();
    doc.removeEventListener('load', onLoad, true);
    clearTimeout(timer);
    boot.remove();
  };
  // Two frames after the player's cover is decoded, so it has painted underneath.
  const finishAfterPaint = (): void => {
    if (!win?.requestAnimationFrame) return finish();
    win.requestAnimationFrame(() => win.requestAnimationFrame(finish));
  };
  const check = (): void => {
    if (finished) return;
    const cover = doc.querySelector<HTMLImageElement>('.pw-cover-image');
    if (cover?.complete && cover.naturalWidth > 0) return finishAfterPaint();
    // The player opened somewhere else than the cover, or failed: nothing to wait for.
    if (doc.querySelector('pw-viewport, .player-shell.has-error')) finish();
  };
  function onLoad(event: Event): void {
    if ((event.target as Element | null)?.classList?.contains('pw-cover-image')) check();
  }

  const timer = setTimeout(finish, timeoutMs);
  doc.addEventListener('load', onLoad, true);
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(check);
    observer.observe(doc.body, { childList: true, subtree: true });
  }
  check();
}
