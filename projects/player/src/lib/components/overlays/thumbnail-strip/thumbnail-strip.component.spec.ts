import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { Chapter, Panel } from '../../../types';
import { ThumbnailStripComponent, type ThumbnailItem, type ThumbnailNavigationTarget } from './thumbnail-strip.component';
import { AssetUrlService } from '../../../services/asset-url.service';
import { ManifestService } from '../../../services/manifest.service';

function chapter(id: string, panelIds: string[], title?: Record<string, string>): Chapter {
  const panels: Record<string, Panel> = {};
  panelIds.forEach((p) => (panels[p] = {}));
  return { id, title, panels, graph: { entry: panelIds[0] ?? '', edges: [] } };
}

/** Override a layout getter on a single element instance. */
function stubNumber(el: HTMLElement, prop: 'offsetWidth' | 'scrollWidth' | 'offsetLeft', value: number): void {
  Object.defineProperty(el, prop, { configurable: true, get: () => value });
}

/** Spy on the options-object overload of Element.scrollTo. */
function scrollSpy(el: HTMLElement): jasmine.Spy<(options: ScrollToOptions) => void> {
  return spyOn(el, 'scrollTo') as unknown as jasmine.Spy<(options: ScrollToOptions) => void>;
}

/** Stub resolver: relative references get a fake base, absolute ones pass through. */
const assetUrlStub = {
  resolve: (src?: string | null) =>
    !src ? '' : /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : 'https://cdn.example/' + src,
};

/** Catalog stub: one image asset with a thumbnail-sized rendition. */
const manifestStub = {
  getAsset: (id: string) =>
    id === 'img-1'
      ? { category: 'image', variants: [{ src: 'https://cdn/img-1-1920.webp', w: 1920 }, { src: 'https://cdn/img-1-320.webp', w: 320 }] }
      : null,
};

describe('ThumbnailStripComponent', () => {
  let fixture: ComponentFixture<ThumbnailStripComponent>;
  let component: ThumbnailStripComponent;

  const chapters: Chapter[] = [
    chapter('ch1', ['p1', 'p2', 'p3'], { 'en-US': 'Opening' }),
    chapter('ch2', ['p4', 'p5']),
  ];

  function setup(
    inputs: Partial<
      Record<
        'chapters' | 'currentChapterId' | 'currentPanelId' | 'currentPanelIds' | 'lockedPanels' | 'visible' | 'coverThumbnail' | 'coverCurrent' | 'locale',
        unknown
      >
    >
  ): void {
    Object.entries(inputs).forEach(([k, v]) => fixture.componentRef.setInput(k, v));
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function container(): HTMLDivElement {
    return el().querySelector('.strip-scroll-container') as HTMLDivElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThumbnailStripComponent],
      providers: [
        { provide: AssetUrlService, useValue: assetUrlStub },
        { provide: ManifestService, useValue: manifestStub },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ThumbnailStripComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing while hidden', () => {
    setup({ chapters, visible: false });
    expect(el().querySelector('.thumbnail-strip')).toBeNull();
  });

  it('lists per chapter a separator, then its panels in reading order, with global indices', () => {
    setup({ chapters, currentChapterId: 'ch1', currentPanelId: 'p2', lockedPanels: ['p5'], visible: true });

    const panels = component.thumbnailItems.filter((i) => i.kind === 'panel');
    expect(component.thumbnailItems.map((i) => i.kind)).toEqual([
      'chapter', 'panel', 'panel', 'panel', 'chapter', 'panel', 'panel',
    ]);
    expect(panels.map((i) => i.panelId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(component.thumbnailItems.map((i) => i.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(panels[0].chapterStart).toBeTrue();
    expect(panels[1].chapterStart).toBeFalse();
    expect(panels[3].chapterStart).toBeTrue();
    expect(panels[0].isCurrentChapter).toBeTrue();
    expect(panels[3].isCurrentChapter).toBeFalse();
    expect(panels[4].isLocked).toBeTrue();
    const step = component.itemWidth + component.itemGap;
    const sep = component.separatorWidth + component.itemGap;
    expect(component.getTotalWidth()).toBe(5 * step + 2 * sep);
  });

  it('orders panels by the chapter graph, not by key order', () => {
    const ch = chapter('g', ['b', 'a', 'c']);
    ch.graph = { entry: 'a', edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] };
    setup({ chapters: [ch], visible: true });
    expect(component.thumbnailItems.filter((i) => i.kind === 'panel').map((i) => i.panelId)).toEqual(['a', 'b', 'c']);
  });

  it('shows each panel’s artwork as its thumbnail (smallest catalog rendition that fits)', () => {
    const ch = chapter('art', ['p1', 'p2']);
    ch.panels['p1'] = { layers: [{ id: 'l1', kind: 'image', z: 0, assetId: 'img-1' }] } as unknown as Panel;
    setup({ chapters: [ch], visible: true });
    const imgs = Array.from(el().querySelectorAll('.thumbnail-image')) as HTMLImageElement[];
    expect(imgs.length).toBe(1);
    expect(imgs[0].getAttribute('src')).toBe('https://cdn/img-1-320.webp');
    expect(el().querySelectorAll('.thumbnail-placeholder').length).toBe(1); // p2 has no art
  });

  it('hides the artwork of locked panels', () => {
    const ch = chapter('art', ['p1']);
    ch.panels['p1'] = { layers: [{ id: 'l1', kind: 'image', z: 0, assetId: 'img-1' }] } as unknown as Panel;
    setup({ chapters: [ch], lockedPanels: ['p1'], visible: true });
    expect(el().querySelector('.thumbnail-image')).toBeNull();
    expect(el().querySelector('.lock-overlay')).not.toBeNull();
  });

  it('renders chapter separators with number and localized title, falling back to the chapter id', () => {
    setup({ chapters, visible: true });
    const titles = Array.from(el().querySelectorAll('.separator-title')).map((n) => n.textContent?.trim());
    const numbers = Array.from(el().querySelectorAll('.separator-number')).map((n) => n.textContent?.trim());
    expect(titles).toEqual(['Opening', 'ch2']);
    expect(numbers).toEqual(['1', '2']);
  });

  it('picks the chapter title of the current locale', () => {
    setup({ chapters: [chapter('l', ['a'], { 'en-US': 'Night', 'de-DE': 'Nacht' })], locale: 'de-DE', visible: true });
    expect(component.thumbnailItems[0].chapterTitle).toBe('Nacht');
  });

  it('falls back to the chapter id when the title object is empty', () => {
    setup({ chapters: [chapter('empty', ['a'], {})], visible: true });
    expect(component.thumbnailItems[0].chapterTitle).toBe('empty');
  });

  it('handles chapters without panels and empty chapter lists', () => {
    const noPanels = { id: 'x', graph: { entry: '', edges: [] } } as unknown as Chapter;
    setup({ chapters: [noPanels], visible: true });
    expect(component.thumbnailItems).toEqual([]);
    expect(el().querySelectorAll('.thumbnail-item').length).toBe(0);
    expect(component.getTotalWidth()).toBe(0);
  });

  it('marks current and locked thumbnails in the DOM with placeholders', () => {
    setup({ chapters, currentChapterId: 'ch1', currentPanelId: 'p2', lockedPanels: ['p3'], visible: true });
    const buttons = el().querySelectorAll('.thumbnail-item') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(5);
    expect(buttons[1].classList).toContain('current');
    expect(buttons[1].getAttribute('aria-current')).toBe('true');
    expect(buttons[0].getAttribute('aria-current')).toBeNull();
    expect(buttons[0].classList).toContain('current-chapter');
    expect(buttons[2].classList).toContain('locked');
    expect(buttons[2].querySelector('.lock-overlay')).not.toBeNull();
    expect(buttons[1].querySelector('.current-indicator')).not.toBeNull();
    expect(buttons[0].querySelector('.placeholder-text')?.textContent?.trim()).toBe('p1');
    expect(buttons[0].getAttribute('aria-label')).toBe('Panel p1');
  });

  it('marks every panel of the current page as current (page view)', () => {
    setup({ chapters, currentChapterId: 'ch1', currentPanelId: 'p1', currentPanelIds: ['p1', 'p2'], visible: true });
    const current = component.thumbnailItems.filter((i) => i.isCurrentPanel).map((i) => i.panelId);
    expect(current).toEqual(['p1', 'p2']);
  });

  it('emits navigate for unlocked panels only', () => {
    setup({ chapters, lockedPanels: ['p2'], visible: true });
    const targets: ThumbnailNavigationTarget[] = [];
    component.navigate.subscribe((t) => targets.push(t));
    const buttons = el().querySelectorAll('.thumbnail-item') as NodeListOf<HTMLButtonElement>;
    buttons[0].click();
    buttons[1].click();
    buttons[4].click();
    expect(targets).toEqual([
      { chapterId: 'ch1', panelId: 'p1' },
      { chapterId: 'ch2', panelId: 'p5' },
    ]);
  });

  it('a chapter separator opens the chapter’s first panel', () => {
    setup({ chapters, visible: true });
    const targets: ThumbnailNavigationTarget[] = [];
    component.navigate.subscribe((t) => targets.push(t));
    (el().querySelectorAll('.chapter-separator')[1] as HTMLButtonElement).click();
    expect(targets).toEqual([{ chapterId: 'ch2', panelId: 'p4' }]);
  });

  describe('cover', () => {
    it('heads the strip when the work has one and navigates to it', () => {
      setup({ chapters, coverThumbnail: 'https://cdn/cover.jpg', visible: true });
      expect(component.thumbnailItems[0].kind).toBe('cover');
      const targets: ThumbnailNavigationTarget[] = [];
      component.navigate.subscribe((t) => targets.push(t));
      const first = el().querySelector('.thumbnail-item') as HTMLButtonElement;
      expect(first.classList).toContain('cover-item');
      expect(first.querySelector('img')?.getAttribute('src')).toBe('https://cdn/cover.jpg');
      first.click();
      expect(targets).toEqual([{ chapterId: '', panelId: '', cover: true }]);
    });

    it('is current while the cover is shown, and then no panel is', () => {
      setup({ chapters, coverThumbnail: 'https://cdn/cover.jpg', coverCurrent: true, currentChapterId: 'ch1', currentPanelId: 'p1', visible: true });
      expect(component.thumbnailItems.filter((i) => i.isCurrentPanel).map((i) => i.kind)).toEqual(['cover']);
    });

    it('is absent without a cover', () => {
      setup({ chapters, visible: true });
      expect(component.thumbnailItems.some((i) => i.kind === 'cover')).toBeFalse();
    });
  });

  it('emits close from the close button', () => {
    setup({ chapters, visible: true });
    let closed = 0;
    component.close.subscribe(() => closed++);
    (el().querySelector('.close-btn') as HTMLButtonElement).click();
    expect(closed).toBe(1);
  });

  describe('getThumbnailUrl', () => {
    const base: ThumbnailItem = {
      kind: 'panel', key: 'k', chapterId: 'c', panelId: 'p', isLocked: false, isCurrentChapter: false,
      isCurrentPanel: false, chapterStart: false, index: 0, left: 0, width: 120,
    };

    it('returns empty string without a thumbnail', () => {
      expect(component.getThumbnailUrl(base)).toBe('');
    });

    it('keeps absolute and data URLs and resolves relative ones through AssetUrlService', () => {
      expect(component.getThumbnailUrl({ ...base, thumbnail: 'http://a/x.png' })).toBe('http://a/x.png');
      expect(component.getThumbnailUrl({ ...base, thumbnail: 'https://a/x.png' })).toBe('https://a/x.png');
      expect(component.getThumbnailUrl({ ...base, thumbnail: 'data:image/png;base64,AA' })).toBe('data:image/png;base64,AA');
      expect(component.getThumbnailUrl({ ...base, thumbnail: 'thumbs/x.png' })).toBe('https://cdn.example/thumbs/x.png');
    });
  });

  describe('virtual scrolling', () => {
    it('only renders items inside the viewport window', () => {
      const many = chapter('big', Array.from({ length: 80 }, (_, i) => `p${i}`));
      setup({ chapters: [many], visible: true });
      // default window 0..6400 px: the separator (0..96) plus panels starting at 104 + n*128
      const rendered = el().querySelectorAll('.thumbnail-item').length;
      expect(rendered).toBe(50);
      expect(rendered).toBeLessThan(80);
    });

    it('recomputes the viewport range from scroll position with a buffer', () => {
      const step = component.itemWidth + component.itemGap; // 128
      const target = document.createElement('div');
      Object.defineProperty(target, 'scrollLeft', { configurable: true, get: () => step * 30 });
      stubNumber(target, 'offsetWidth', step * 5);
      component.onScroll({ target } as unknown as Event);
      expect(component.viewportStart).toBe(step * 20);
      expect(component.viewportEnd).toBe(step * 45);

      Object.defineProperty(target, 'scrollLeft', { configurable: true, get: () => 0 });
      component.onScroll({ target } as unknown as Event);
      expect(component.viewportStart).toBe(0);
    });

    it('isInViewport respects both bounds', () => {
      component.viewportStart = 500;
      component.viewportEnd = 1000;
      const item: ThumbnailItem = {
        kind: 'panel', key: 'k', chapterId: 'c', panelId: 'p', isLocked: false, isCurrentChapter: false,
        isCurrentPanel: false, chapterStart: false, index: 0, left: 0, width: 120,
      };
      expect(component.isInViewport({ ...item, left: 370 })).toBeFalse(); // ends at 490
      expect(component.isInViewport({ ...item, left: 380 })).toBeTrue(); // ends at 500
      expect(component.isInViewport({ ...item, left: 1000 })).toBeTrue();
      expect(component.isInViewport({ ...item, left: 1001 })).toBeFalse();
    });
  });

  describe('scroll container interactions', () => {
    beforeEach(() => {
      setup({ chapters, currentPanelId: 'p4', visible: true });
    });

    it('centers the current panel', () => {
      const c = container();
      stubNumber(c, 'offsetWidth', 200);
      const spy = scrollSpy(c);
      component.scrollToCurrentPanel();
      // p4 sits after ch1's separator (104) + 3 panels (3 * 128) + ch2's separator (104) = 592; 592 - 100 + 60
      expect(spy).toHaveBeenCalledWith({ left: 552, behavior: 'smooth' });
    });

    it('clamps the centered position at zero', () => {
      fixture.componentRef.setInput('currentPanelId', 'p1');
      fixture.detectChanges();
      const c = container();
      stubNumber(c, 'offsetWidth', 1000);
      const spy = scrollSpy(c);
      component.scrollToCurrentPanel();
      expect(spy).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' });
    });

    it('does not scroll when there is no current panel', () => {
      fixture.componentRef.setInput('currentPanelId', 'nope');
      fixture.detectChanges();
      const spy = scrollSpy(container());
      component.scrollToCurrentPanel();
      expect(spy).not.toHaveBeenCalled();
    });

    it('scrollLeft / scrollRight move by 80% of the viewport and clamp', () => {
      const c = container();
      stubNumber(c, 'offsetWidth', 100);
      stubNumber(c, 'scrollWidth', 500);
      const spy = scrollSpy(c);

      c.scrollLeft = 50;
      component.scrollLeft();
      expect(spy).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' });

      component.scrollRight();
      expect(spy.calls.mostRecent().args[0]).toEqual({ left: c.scrollLeft + 80, behavior: 'smooth' });
    });

    it('scrollRight clamps to the maximum scroll offset', () => {
      const c = container();
      stubNumber(c, 'offsetWidth', 100);
      stubNumber(c, 'scrollWidth', 150);
      const spy = scrollSpy(c);
      component.scrollRight();
      expect(spy).toHaveBeenCalledWith({ left: 50, behavior: 'smooth' });
    });

    it('canScrollLeft / canScrollRight reflect the scroll position', () => {
      const c = container();
      const pos = { left: 0 };
      Object.defineProperty(c, 'scrollLeft', { configurable: true, get: () => pos.left, set: (v: number) => (pos.left = v) });
      stubNumber(c, 'offsetWidth', 100);
      stubNumber(c, 'scrollWidth', 300);
      expect(component.canScrollLeft()).toBeFalse();
      expect(component.canScrollRight()).toBeTrue();
      pos.left = 200;
      expect(component.canScrollLeft()).toBeTrue();
      expect(component.canScrollRight()).toBeFalse();
    });

    it('drag-scrolls with the mouse and resets the cursor', () => {
      const c = container();
      const pos = { left: 100 };
      Object.defineProperty(c, 'scrollLeft', { configurable: true, get: () => pos.left, set: (v: number) => (pos.left = v) });
      stubNumber(c, 'offsetLeft', 10);

      c.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, bubbles: true }));
      expect(c.style.cursor).toBe('grabbing');

      const move = new MouseEvent('mousemove', { clientX: 40, bubbles: true, cancelable: true });
      c.dispatchEvent(move);
      // walk = (30 - 50) * 2 = -40 -> scrollLeft = 100 + 40
      expect(pos.left).toBe(140);
      expect(move.defaultPrevented).toBeTrue();

      c.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      expect(c.style.cursor).toBe('grab');

      // after mouseup, moving no longer scrolls
      c.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, bubbles: true }));
      expect(pos.left).toBe(140);
    });

    it('mouseleave ends an active drag but is a no-op otherwise', () => {
      const c = container();
      c.dispatchEvent(new MouseEvent('mouseleave'));
      expect(c.style.cursor).toBe('');
      c.dispatchEvent(new MouseEvent('mousedown', { clientX: 5 }));
      c.dispatchEvent(new MouseEvent('mouseleave'));
      expect(c.style.cursor).toBe('grab');
    });

    it('arrow buttons trigger scrolling', () => {
      const c = container();
      const spy = scrollSpy(c);
      spyOn(component, 'canScrollLeft').and.returnValue(true);
      spyOn(component, 'canScrollRight').and.returnValue(true);
      fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      fixture.detectChanges();
      (el().querySelector('.nav-arrow-left') as HTMLButtonElement).click();
      (el().querySelector('.nav-arrow-right') as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('auto-scroll to the current panel', () => {
    it('scrolls when the strip is first rendered visible', () => {
      const spy = spyOn(Element.prototype, 'scrollTo');
      setup({ chapters, currentPanelId: 'p4', visible: true });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.calls.mostRecent().object).toBe(container());
    });

    it('scrolls once the strip is shown after being created hidden', () => {
      const spy = spyOn(Element.prototype, 'scrollTo');
      setup({ chapters, currentPanelId: 'p4', visible: false });
      expect(spy).not.toHaveBeenCalled();

      fixture.componentRef.setInput('visible', true);
      fixture.detectChanges();
      expect(container()).not.toBeNull();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.calls.mostRecent().object).toBe(container());
      expect(spy.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ behavior: 'smooth' }));
    });

    it('scrolls to the new panel when currentPanelId changes', () => {
      setup({ chapters, currentPanelId: 'p1', visible: true });
      const c = container();
      stubNumber(c, 'offsetWidth', 200);
      const spy = scrollSpy(c);

      fixture.componentRef.setInput('currentPanelId', 'p4');
      fixture.detectChanges();
      // p4 at 592 (see 'centers the current panel'); 592 - 100 + 60 = 552
      expect(spy).toHaveBeenCalledOnceWith({ left: 552, behavior: 'smooth' });
    });

    it('does not scroll on changes while hidden', () => {
      setup({ chapters, currentPanelId: 'p1', visible: false });
      const spy = spyOn(Element.prototype, 'scrollTo');
      fixture.componentRef.setInput('currentPanelId', 'p4');
      fixture.detectChanges();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('without a scroll container (hidden)', () => {
    it('all container-dependent methods are safe no-ops', () => {
      setup({ chapters, visible: false });
      expect(component.scrollContainer).toBeUndefined();
      expect(() => component.scrollToCurrentPanel()).not.toThrow();
      expect(() => component.scrollLeft()).not.toThrow();
      expect(() => component.scrollRight()).not.toThrow();
      expect(component.canScrollLeft()).toBeFalse();
      expect(component.canScrollRight()).toBeFalse();
      expect(() => component.onMouseDown(new MouseEvent('mousedown'))).not.toThrow();
      expect(() => component.onMouseMove(new MouseEvent('mousemove'))).not.toThrow();
      expect(() => component.onMouseUp()).not.toThrow();
    });
  });

  describe('keyboard', () => {
    it('ignores keys while hidden', () => {
      setup({ chapters, visible: false });
      let closed = 0;
      component.close.subscribe(() => closed++);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(0);
    });

    it('Escape closes, arrows scroll, other keys are ignored', () => {
      setup({ chapters, visible: true });
      let closed = 0;
      component.close.subscribe(() => closed++);
      const left = spyOn(component, 'scrollLeft');
      const right = spyOn(component, 'scrollRight');

      const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      window.dispatchEvent(esc);
      expect(closed).toBe(1);
      expect(esc.defaultPrevented).toBeTrue();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
      expect(left).toHaveBeenCalledTimes(1);
      expect(right).toHaveBeenCalledTimes(1);

      const other = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
      window.dispatchEvent(other);
      expect(other.defaultPrevented).toBeFalse();
      expect(closed).toBe(1);
    });
  });
});
