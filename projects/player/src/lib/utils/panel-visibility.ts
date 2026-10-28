/**
 * "The panel is shown" — the one definition the player uses to start
 * time-based panel content: panel animations (`PanelAnimationDirective`) and
 * the clock of timed speech balloons (`BubbleClockDirective`). Both start at
 * the same instant, so keyframes, camera moves and balloons stay in step.
 *
 * A panel counts as shown when at least START_VISIBLE_RATIO of it is visible,
 * or — for a panel larger than the viewport — when its visible part covers
 * that share of the viewport. In panel view the current panel fills the
 * screen, so the first observation reports it shown immediately.
 */

/** Share of the panel (or of the viewport, for oversized panels) that must be visible to count as shown. */
export const START_VISIBLE_RATIO = 0.25;

/**
 * Observe whether `host` is shown and report every observation to
 * `onChange`. Without IntersectionObserver (old browsers, server rendering)
 * the panel counts as shown right away. Returns a function that stops
 * observing. Callers that do not need change detection should call it
 * outside the Angular zone.
 */
export function observePanelShown(host: Element, onChange: (shown: boolean) => void): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onChange(true);
    return () => undefined;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      onChange(isPanelShown(entry));
    },
    { threshold: [0, START_VISIBLE_RATIO, 0.5, 1] }
  );
  observer.observe(host);
  return () => observer.disconnect();
}

/** Whether one IntersectionObserver entry means "shown" (see the file comment). */
export function isPanelShown(
  entry: Pick<IntersectionObserverEntry, 'isIntersecting' | 'intersectionRatio' | 'intersectionRect' | 'rootBounds'>
): boolean {
  const root = entry.rootBounds;
  const visibleArea = entry.intersectionRect.width * entry.intersectionRect.height;
  const fillsViewport = !!root && visibleArea >= root.width * root.height * START_VISIBLE_RATIO;
  return entry.isIntersecting && (entry.intersectionRatio >= START_VISIBLE_RATIO || fillsViewport);
}
