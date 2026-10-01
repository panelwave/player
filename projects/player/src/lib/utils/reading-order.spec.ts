import type { Chapter } from '../types';
import { chapterReadingOrder, isChapterEndPanel } from './reading-order';

const chapter = (panels: string[], entry: string | string[], edges: [string, string][] = []): Chapter =>
  ({
    id: 'c',
    panels: Object.fromEntries(panels.map((id) => [id, { layers: [] }])),
    graph: { entry, edges: edges.map(([from, to]) => ({ from, to })) },
  }) as unknown as Chapter;

describe('chapterReadingOrder', () => {
  it('walks the graph breadth-first from the entry, then appends unreachable panels', () => {
    const c = chapter(['p1', 'p2', 'p3', 'p4', 'orphan'], 'p1', [
      ['p1', 'p3'],
      ['p1', 'p2'],
      ['p3', 'p4'],
    ]);
    expect(chapterReadingOrder(c)).toEqual(['p1', 'p3', 'p2', 'p4', 'orphan']);
  });

  it('follows the panel key order in an edge-less chapter, entry first', () => {
    expect(chapterReadingOrder(chapter(['p1', 'p2', 'p3'], 'p1'))).toEqual(['p1', 'p2', 'p3']);
    expect(chapterReadingOrder(chapter(['p1', 'p2', 'p3'], 'p2'))).toEqual(['p2', 'p1', 'p3']);
  });

  it('accepts several entries and a missing graph', () => {
    expect(chapterReadingOrder(chapter(['a', 'b', 'c'], ['b', 'c']))).toEqual(['b', 'c', 'a']);
    expect(chapterReadingOrder({ id: 'x', panels: { a: {}, b: {} } } as unknown as Chapter)).toEqual(['a', 'b']);
  });
});

describe('isChapterEndPanel', () => {
  it('is a panel without outgoing edges when the chapter has edges', () => {
    const c = chapter(['p1', 'p2', 'p3'], 'p1', [['p1', 'p2']]);
    expect(isChapterEndPanel(c, 'p1')).toBeFalse();
    expect(isChapterEndPanel(c, 'p2')).toBeTrue();
    expect(isChapterEndPanel(c, 'p3')).toBeTrue();
  });

  it('is only the last panel in reading order when the chapter has no edges', () => {
    const c = chapter(['p1', 'p2', 'p3'], 'p1');
    expect(isChapterEndPanel(c, 'p1')).toBeFalse();
    expect(isChapterEndPanel(c, 'p2')).toBeFalse();
    expect(isChapterEndPanel(c, 'p3')).toBeTrue();
  });
});
