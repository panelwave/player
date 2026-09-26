import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import type { Chapter, Page, Panel, PanelWaveManifest } from '../../../types';
import { TocOverlayComponent, type TocNavigationTarget } from './toc-overlay.component';

function page(id: string, readingOrder: string[], title?: Record<string, string>): Page {
  return { id, title, readingOrder, layout: { format: 'mobile-portrait' } } as Page;
}

describe('TocOverlayComponent', () => {
  let fixture: ComponentFixture<TocOverlayComponent>;
  let component: TocOverlayComponent;

  const withThumb = (thumbnail: string, title?: Record<string, string>): Panel =>
    ({ title, thumbnail }) as Panel;

  const chapters: Chapter[] = [
    {
      id: 'ch1',
      title: { 'en-US': 'The Harbor', 'de-DE': 'Der Hafen' },
      panels: {
        p1: withThumb('thumbs/p1.png', { 'en-US': 'Arrival' }),
        p2: withThumb('https://cdn.example/p2.png'),
        p3: {},
      },
      graph: { entry: 'p1', edges: [] },
    },
    {
      id: 'ch2',
      title: { 'en-US': 'The Storm' },
      pages: [page('1', ['p4', 'missing', 'p5'], { 'en-US': 'Opening spread' }), page('2', ['p6'])],
      panels: { p4: withThumb('data:image/png;base64,AA'), p5: {}, p6: {} },
      graph: { entry: 'p4', edges: [] },
    },
    { id: 'ch3', panels: {}, graph: { entry: '', edges: [] } },
  ];

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function render(): void {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  }

  function create(inputs: Record<string, unknown>): void {
    fixture = TestBed.createComponent(TocOverlayComponent);
    component = fixture.componentInstance;
    Object.entries(inputs).forEach(([k, v]) => fixture.componentRef.setInput(k, v));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TocOverlayComponent, TranslateModule.forRoot()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { toc: { title: 'Contents', current: 'Now reading', no_results: 'Nothing for "{{query}}"' } });
    translate.use('en');
  });

  it('renders nothing while hidden', () => {
    create({ chapters, visible: false });
    expect(el().querySelector('.toc-overlay')).toBeNull();
  });

  it('extracts chapters from a manifest when provided', () => {
    const manifest = { chapters } as unknown as PanelWaveManifest;
    create({ manifest, visible: true });
    expect(component.chapters).toEqual(chapters);
    expect(el().querySelectorAll('.chapter-item').length).toBe(3);
  });

  describe('input changes after init', () => {
    it('picks up a manifest that arrives later', () => {
      create({ visible: true });
      expect(el().querySelectorAll('.chapter-item').length).toBe(0);
      fixture.componentRef.setInput('manifest', { chapters } as unknown as PanelWaveManifest);
      fixture.detectChanges();
      expect(component.chapters).toEqual(chapters);
      expect(el().querySelectorAll('.chapter-item').length).toBe(3);
    });

    it('picks up a replaced manifest', () => {
      create({ manifest: { chapters } as unknown as PanelWaveManifest, visible: true });
      fixture.componentRef.setInput('manifest', { chapters: [chapters[1]] } as unknown as PanelWaveManifest);
      fixture.detectChanges();
      expect(component.filteredChapters.map((c) => c.id)).toEqual(['ch2']);
      expect(el().querySelectorAll('.chapter-item').length).toBe(1);
    });

    it('picks up a changed chapters input and clamps the selection', () => {
      create({ chapters, visible: true });
      component.selectChapter(2);
      fixture.componentRef.setInput('chapters', [chapters[0]]);
      fixture.detectChanges();
      expect(el().querySelectorAll('.chapter-item').length).toBe(1);
      expect(component.selectedChapterIndex).toBe(0);
    });

    it('selects the new current chapter when currentChapterId changes', () => {
      create({ chapters, visible: true, currentChapterId: 'ch1' });
      expect(component.selectedChapterIndex).toBe(0);
      fixture.componentRef.setInput('currentChapterId', 'ch3');
      fixture.detectChanges();
      expect(component.selectedChapterIndex).toBe(2);
    });
  });

  it('renders numbered, localized chapter titles with an id fallback', () => {
    create({ chapters, visible: true });
    expect(el().querySelector('.toc-title')?.textContent?.trim()).toBe('Contents');
    const titles = Array.from(el().querySelectorAll('.chapter-title')).map((t) => t.textContent?.trim());
    expect(titles).toEqual(['The Harbor', 'The Storm', 'ch3']);
    const numbers = Array.from(el().querySelectorAll('.chapter-number')).map((t) => t.textContent?.trim());
    expect(numbers).toEqual(['1', '2', '3']);
  });

  it('uses the locale input for titles', () => {
    create({ chapters, visible: true, locale: 'de-DE' });
    expect(el().querySelector('.chapter-title')?.textContent?.trim()).toBe('Der Hafen');
  });

  it('pre-selects and badges the current chapter and panel', () => {
    create({ chapters, visible: true, currentChapterId: 'ch2', currentPanelId: 'p4' });
    expect(component.selectedChapterIndex).toBe(1);
    const items = el().querySelectorAll('.chapter-item');
    expect(items[1].classList).toContain('selected');
    expect(items[1].classList).toContain('current');
    expect(items[1].querySelector('.current-badge')?.textContent?.trim()).toBe('Now reading');
    expect(items[0].querySelector('.current-badge')).toBeNull();
    const current = el().querySelector('.panel-card.current') as HTMLElement;
    expect(current.querySelector('.current-overlay')).not.toBeNull();
    expect(component.getSelectedChapter()?.id).toBe('ch2');
  });

  it('keeps index 0 when the current chapter id is unknown', () => {
    create({ chapters, visible: true, currentChapterId: 'nope' });
    expect(component.selectedChapterIndex).toBe(0);
  });

  it('lists panels of a page-less chapter with resolved thumbnails and titles', () => {
    create({ chapters, visible: true, baseUrl: 'https://assets.example/', currentPanelId: 'p2' });
    const cards = el().querySelectorAll('.chapter-item')[0].querySelectorAll('.panel-card');
    expect(cards.length).toBe(3);
    expect(cards[0].querySelector('img')?.getAttribute('src')).toBe('https://assets.example/thumbs/p1.png');
    expect(cards[0].querySelector('.panel-title')?.textContent?.trim()).toBe('Arrival');
    expect(cards[1].querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/p2.png');
    expect(cards[1].classList).toContain('current');
    expect(cards[1].querySelector('.current-overlay')).not.toBeNull();
    expect(cards[2].querySelector('.panel-thumbnail.placeholder')).not.toBeNull();
    expect(cards[2].querySelector('.panel-title')?.textContent?.trim()).toBe('p3');
  });

  it('groups panels by page in reading order, skipping unknown ids', () => {
    create({ chapters, visible: true, currentChapterId: 'ch2' });
    const groups = el().querySelectorAll('.page-group');
    expect(groups.length).toBe(2);
    expect(groups[0].querySelector('.page-title')?.textContent?.trim()).toBe('Opening spread');
    expect(groups[1].querySelector('.page-title')?.textContent?.trim()).toBe('Page 2');
    const titles = Array.from(groups[0].querySelectorAll('.panel-title')).map((t) => t.textContent?.trim());
    expect(titles).toEqual(['p4', 'p5']);
    expect(groups[0].querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA');
  });

  it('page helpers handle missing panels / reading order', () => {
    create({ chapters, visible: true });
    const noPanels = { id: 'x', graph: { entry: '', edges: [] } } as unknown as Chapter;
    expect(component.getPanels(noPanels)).toEqual([]);
    expect(component.getPages(noPanels)).toEqual([]);
    expect(component.hasPages(noPanels)).toBeFalse();
    expect(component.hasPages({ ...chapters[0], pages: [] })).toBeFalse();
    expect(component.getPanelsForPage(noPanels, page('1', ['a']))).toEqual([]);
    expect(component.getPanelsForPage(chapters[1], { id: '9' } as Page)).toEqual([]);
  });

  describe('localization fallbacks', () => {
    beforeEach(() => create({ chapters, visible: true }));

    it('exact, then base language, then first key, else empty', () => {
      component.locale = 'en-US';
      expect(component.getLocalizedString({ 'en-GB': 'Colour' })).toBe('Colour');
      component.locale = 'ja-JP';
      expect(component.getLocalizedString({ 'fr-FR': 'Bonjour' })).toBe('Bonjour');
      expect(component.getLocalizedString({})).toBe('');
      expect(component.getLocalizedString(undefined)).toBe('');
    });
  });

  describe('navigation', () => {
    let targets: TocNavigationTarget[];
    beforeEach(() => {
      create({ chapters, visible: true });
      targets = [];
      component.navigate.subscribe((t) => targets.push(t));
    });

    it('clicking a chapter header navigates to the chapter and selects it', () => {
      const header = el().querySelectorAll('.chapter-header')[1] as HTMLElement;
      header.click();
      fixture.detectChanges();
      expect(targets).toEqual([{ chapterId: 'ch2' }]);
      expect(component.selectedChapterIndex).toBe(1);
      expect(el().querySelectorAll('.chapter-item')[1].querySelector('.panel-list')).not.toBeNull();
      expect(el().querySelectorAll('.chapter-item')[0].querySelector('.panel-list')).toBeNull();
    });

    it('Enter on a chapter header navigates exactly once (window handler does not fire too)', () => {
      expect(document.body.contains(el())).toBeTrue();
      const header = el().querySelectorAll('.chapter-header')[0] as HTMLElement;
      header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(targets).toEqual([{ chapterId: 'ch1' }]);
    });

    it('Enter on a non-selected chapter header navigates to that chapter only', () => {
      const header = el().querySelectorAll('.chapter-header')[2] as HTMLElement;
      header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(targets).toEqual([{ chapterId: 'ch3' }]);
    });

    it('Enter bubbling from a panel card button is left to the button', () => {
      const card = el().querySelectorAll('.panel-card')[0] as HTMLButtonElement;
      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(targets).toEqual([]);
    });

    it('Enter in the search input still navigates to the selected chapter', () => {
      const input = el().querySelector('.search-input') as HTMLInputElement;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(targets).toEqual([{ chapterId: 'ch1' }]);
    });

    it('Enter on a chapter item selects without navigating', () => {
      const item = el().querySelectorAll('.chapter-item')[2] as HTMLElement;
      item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(component.selectedChapterIndex).toBe(2);
    });

    it('clicking a panel card navigates to that panel', () => {
      (el().querySelectorAll('.panel-card')[2] as HTMLButtonElement).click();
      expect(targets).toContain({ chapterId: 'ch1', panelId: 'p3' });
    });

    it('clicking a panel card inside a page navigates to that panel', () => {
      component.selectChapter(1);
      render();
      (el().querySelector('.page-group .panel-card') as HTMLButtonElement).click();
      expect(targets).toContain({ chapterId: 'ch2', panelId: 'p4' });
    });
  });

  describe('search', () => {
    function search(value: string): void {
      const input = el().querySelector('.search-input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    beforeEach(() => create({ chapters, visible: true, currentChapterId: 'ch2' }));

    it('filters chapters by localized title and resets selection', () => {
      search('storm');
      expect(component.filteredChapters.map((c) => c.id)).toEqual(['ch2']);
      expect(component.selectedChapterIndex).toBe(0);
      expect(el().querySelectorAll('.chapter-item').length).toBe(1);
    });

    it('shows an empty state with the query', () => {
      search('xyz');
      expect(el().querySelectorAll('.chapter-item').length).toBe(0);
      expect(el().querySelector('.empty-state')?.textContent?.trim()).toBe('Nothing for "xyz"');
      expect(component.getSelectedChapter()).toBeUndefined();
    });

    it('blank query restores all chapters', () => {
      search('storm');
      search('  ');
      expect(component.filteredChapters.length).toBe(3);
    });
  });

  describe('keyboard', () => {
    let closed: number;
    let targets: TocNavigationTarget[];

    function key(k: string): KeyboardEvent {
      const e = new KeyboardEvent('keydown', { key: k, cancelable: true });
      window.dispatchEvent(e);
      return e;
    }

    beforeEach(() => {
      create({ chapters, visible: true });
      closed = 0;
      targets = [];
      component.close.subscribe(() => closed++);
      component.navigate.subscribe((t) => targets.push(t));
    });

    it('ArrowDown/ArrowUp move the selection and clamp at the ends', () => {
      expect(key('ArrowDown').defaultPrevented).toBeTrue();
      expect(component.selectedChapterIndex).toBe(1);
      key('ArrowDown');
      key('ArrowDown');
      expect(component.selectedChapterIndex).toBe(2);
      key('ArrowUp');
      expect(component.selectedChapterIndex).toBe(1);
      key('ArrowUp');
      key('ArrowUp');
      expect(component.selectedChapterIndex).toBe(0);
    });

    it('Enter navigates to the selected chapter', () => {
      key('ArrowDown');
      key('Enter');
      expect(targets).toEqual([{ chapterId: 'ch2' }]);
    });

    it('Enter with no chapters does nothing', () => {
      component.filteredChapters = [];
      expect(key('Enter').defaultPrevented).toBeTrue();
      expect(targets).toEqual([]);
    });

    it('Escape on window closes; other keys are ignored', () => {
      key('Escape');
      expect(closed).toBe(1);
      expect(key('x').defaultPrevented).toBeFalse();
      expect(closed).toBe(1);
    });

    it('Escape inside the overlay closes exactly once', () => {
      (el().querySelector('.toc-container') as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(closed).toBe(1);
    });

    it('ignores keys while hidden', () => {
      fixture.componentRef.setInput('visible', false);
      fixture.detectChanges();
      key('Escape');
      key('ArrowDown');
      expect(closed).toBe(0);
      expect(component.selectedChapterIndex).toBe(0);
    });
  });

  describe('closing', () => {
    it('close button and backdrop click emit close; inner clicks do not', () => {
      create({ chapters, visible: true });
      let closed = 0;
      component.close.subscribe(() => closed++);
      (el().querySelector('.close-btn') as HTMLButtonElement).click();
      expect(closed).toBe(1);
      (el().querySelector('.toc-container') as HTMLElement).click();
      expect(closed).toBe(1);
      (el().querySelector('.toc-overlay') as HTMLElement).click();
      expect(closed).toBe(2);
    });
  });
});
