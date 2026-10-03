import { branchVisibility, buildBranchGraph } from './branch-visibility';
import type { Chapter } from '../types';

/** A panel with goTo hotspots to the given targets. */
const choice = (...targets: string[]) => ({
  hotspots: targets.map((to, i) => ({ id: `h${i}`, shape: { type: 'rect', x: 0, y: 0, w: 1, h: 1 }, label: {}, action: { type: 'goTo', to } })),
});
const plain = () => ({});
const edges = (...pairs: string[]) => pairs.map((p) => { const [from, to] = p.split('>'); return { from, to }; });

/*
 * Chapter 1:  a → D1 ─┬─ b1 → b2 ─┐
 *                     └─ c1 ──────┴→ r → D2 ─┬─ x → END1 (no edges; chapter goes on)
 *                                            └─ y → y2 (→ chapter 2 by edge)
 * Chapter 2:  e → f
 */
const chapters = [
  {
    id: 'ch1',
    graph: { entry: 'a', edges: edges('a>D1', 'b1>b2', 'b2>r', 'c1>r', 'r>D2', 'x>END1', 'y>y2', 'y2>e') },
    panels: { a: plain(), D1: choice('b1', 'c1'), b1: plain(), b2: plain(), c1: plain(), r: plain(), D2: choice('x', 'y'), x: plain(), END1: plain(), y: plain(), y2: plain() },
  },
  { id: 'ch2', graph: { entry: 'e', edges: edges('e>f') }, panels: { e: plain(), f: plain() } },
] as unknown as Chapter[];

describe('branchVisibility', () => {
  const graph = buildBranchGraph(chapters);

  it('finds the choice panels and their options', () => {
    expect([...graph.choices.keys()].sort()).toEqual(['D1', 'D2']);
    expect(graph.choices.get('D1')).toEqual(['b1', 'c1']);
    // END1 has no edge: it continues with the next chapter's entry.
    expect([...graph.next.get('END1')!]).toEqual(['e']);
  });

  it('hides the branches of choices not made yet, up to where they rejoin', () => {
    const { unchosen, hidden } = branchVisibility(graph, new Map());
    expect(unchosen.size).toBe(0);
    expect([...hidden].sort()).toEqual(['END1', 'b1', 'b2', 'c1', 'x', 'y', 'y2']);
    // Rejoin point, later panels and the next chapter stay visible.
    for (const id of ['a', 'D1', 'r', 'D2', 'e', 'f']) expect(hidden.has(id)).toBeFalse();
  });

  it('reveals the chosen branch; the other branch stays off the path', () => {
    const { unchosen, hidden } = branchVisibility(graph, new Map([['D1', 'c1']]));
    expect([...unchosen].sort()).toEqual(['b1', 'b2']);
    expect(hidden.has('c1')).toBeFalse();
    expect(hidden.has('b1')).toBeTrue();
    expect(hidden.has('x')).toBeTrue(); // D2 is still open
  });

  it('a chapter end that continues implicitly does not cut the chosen path off from the next chapter', () => {
    const { unchosen } = branchVisibility(graph, new Map([['D1', 'b1'], ['D2', 'x']]));
    expect([...unchosen].sort()).toEqual(['c1', 'y', 'y2']);
    expect(unchosen.has('e')).toBeFalse();
    expect(unchosen.has('f')).toBeFalse();
  });

  it('ignores a choice that lies inside an unchosen branch', () => {
    const nested = [
      {
        id: 'ch1',
        graph: { entry: 'a', edges: edges('a>D', 'k>r', 'm1>r', 'm2>r') },
        // D: k (main) or M (a nested choice between m1 and m2); all rejoin at r.
        panels: { a: plain(), D: choice('k', 'M'), k: plain(), M: choice('m1', 'm2'), m1: plain(), m2: plain(), r: plain() },
      },
    ] as unknown as Chapter[];
    const { unchosen, hidden } = branchVisibility(buildBranchGraph(nested), new Map([['D', 'k']]));
    expect([...unchosen].sort()).toEqual(['M', 'm1', 'm2']);
    expect([...hidden].sort()).toEqual(['M', 'm1', 'm2']);
    expect(hidden.has('k')).toBeFalse();
    expect(hidden.has('r')).toBeFalse();
  });

  it('an unvisited variant of a choice does not hide what the visited variant leads to', () => {
    // D and D-V2 are the same decision (a condition picks one); both lead on to t → shared.
    const variants = [
      {
        id: 'ch1',
        graph: { entry: 'a', edges: edges('a>D', 'a>DV', 't>shared', 'tv>shared', 'u>z', 'uv>z') },
        panels: { a: plain(), D: choice('t', 'u'), DV: choice('tv', 'uv'), t: plain(), u: plain(), tv: plain(), uv: plain(), shared: plain(), z: plain() },
      },
    ] as unknown as Chapter[];
    const g = buildBranchGraph(variants);
    // Nothing chosen yet: 'shared' is reachable past either variant, so only
    // what one decision alone leads to is hidden.
    const open = branchVisibility(g, new Map());
    expect(open.hidden.has('shared')).toBeFalse();
    expect(open.hidden.has('t')).toBeTrue();
    // The reader passed D and picked t: DV stays open but must not hide 'shared'.
    const picked = branchVisibility(g, new Map([['D', 't']]));
    expect(picked.hidden.has('shared')).toBeFalse();
    expect(picked.hidden.has('t')).toBeFalse();
    expect(picked.unchosen.has('u')).toBeTrue();
  });

  it('a single jump hotspot is not a choice', () => {
    const one = [{ id: 'c', graph: { entry: 'a', edges: [] }, panels: { a: choice('b'), b: plain() } }] as unknown as Chapter[];
    expect(buildBranchGraph(one).choices.size).toBe(0);
  });
});
