/**
 * Unit tests for FlowEngineService
 */

import { TestBed } from '@angular/core/testing';
import { FlowEngineService } from './flow-engine.service';
import type { Graph } from '../types';

describe('FlowEngineService', () => {
  let service: FlowEngineService;

  // Simple linear graph
  const linearGraph: Graph = {
    entry: 'p1',
    edges: [
      { from: 'p1', to: 'p2' },
      { from: 'p2', to: 'p3' },
    ],
  };

  // Graph with conditions
  const conditionalGraph: Graph = {
    entry: 'p1',
    edges: [
      { from: 'p1', to: 'p2', condition: { '==': [{ var: 'choice' }, 'a'] } },
      { from: 'p1', to: 'p3', condition: { '==': [{ var: 'choice' }, 'b'] } },
      { from: 'p1', to: 'p4' }, // No condition (always valid)
    ],
  };

  // Graph with priorities
  const priorityGraph: Graph = {
    entry: 'p1',
    edges: [
      { from: 'p1', to: 'p2', priority: 1 },
      { from: 'p1', to: 'p3', priority: 10 },
      { from: 'p1', to: 'p4', priority: 5 },
    ],
  };

  // Graph with cycle
  const cyclicGraph: Graph = {
    entry: 'p1',
    edges: [
      { from: 'p1', to: 'p2' },
      { from: 'p2', to: 'p3' },
      { from: 'p3', to: 'p1' }, // Cycle back to p1
    ],
  };

  // Branching graph
  const branchingGraph: Graph = {
    entry: 'p1',
    edges: [
      { from: 'p1', to: 'p2' },
      { from: 'p1', to: 'p3' },
      { from: 'p2', to: 'p4' },
      { from: 'p3', to: 'p4' },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [FlowEngineService],
    });
    service = TestBed.inject(FlowEngineService);
  });

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });
  });

  describe('getNextPanel - Basic Navigation', () => {
    it('should get next panel in linear graph', () => {
      const result = service.getNextPanel(linearGraph, 'p1', {});
      expect(result.nextPanelId).toBe('p2');
    });

    it('should return null when no edges exist', () => {
      const result = service.getNextPanel(linearGraph, 'p3', {});
      expect(result.nextPanelId).toBeNull();
    });

    it('should return transition if specified', () => {
      const graphWithTransition: Graph = {
        entry: 'p1',
        edges: [{ from: 'p1', to: 'p2', transition: { type: 'fade', durationMs: 500 } }],
      };

      const result = service.getNextPanel(graphWithTransition, 'p1', {});
      expect(result.transition).toBeDefined();
      expect(result.transition?.type).toBe('fade');
    });

    it('should return action if specified', () => {
      const graphWithAction: Graph = {
        entry: 'p1',
        edges: [{ from: 'p1', to: 'p2', action: [{ op: 'set', var: 'test', value: 'value' }] }],
      };

      const result = service.getNextPanel(graphWithAction, 'p1', {});
      expect(result.action).toBeDefined();
      expect(result.action?.length).toBe(1);
    });
  });

  describe('getNextPanel - Conditions', () => {
    it('should follow edge when condition is true', () => {
      const context = { choice: 'a' };
      const result = service.getNextPanel(conditionalGraph, 'p1', context);
      expect(result.nextPanelId).toBe('p2');
    });

    it('should follow different edge for different condition', () => {
      const context = { choice: 'b' };
      const result = service.getNextPanel(conditionalGraph, 'p1', context);
      expect(result.nextPanelId).toBe('p3');
    });

    it('should follow edge with no condition when others fail', () => {
      const context = { choice: 'c' }; // No matching condition
      const result = service.getNextPanel(conditionalGraph, 'p1', context);
      expect(result.nextPanelId).toBe('p4'); // Unconditional edge
    });

    it('should return null when all conditions fail', () => {
      const graphAllConditional: Graph = {
        entry: 'p1',
        edges: [
          { from: 'p1', to: 'p2', condition: { '==': [{ var: 'choice' }, 'a'] } },
          { from: 'p1', to: 'p3', condition: { '==': [{ var: 'choice' }, 'b'] } },
        ],
      };

      const context = { choice: 'c' };
      const result = service.getNextPanel(graphAllConditional, 'p1', context);
      expect(result.nextPanelId).toBeNull();
    });
  });

  describe('getNextPanel - Priority', () => {
    it('should select highest priority edge', () => {
      const result = service.getNextPanel(priorityGraph, 'p1', {});
      expect(result.nextPanelId).toBe('p3'); // Priority 10
    });

    it('should handle missing priority as 0', () => {
      const graphMixedPriority: Graph = {
        entry: 'p1',
        edges: [
          { from: 'p1', to: 'p2' }, // No priority (defaults to 0)
          { from: 'p1', to: 'p3', priority: 1 },
        ],
      };

      const result = service.getNextPanel(graphMixedPriority, 'p1', {});
      expect(result.nextPanelId).toBe('p3'); // Has priority 1
    });

    it('should combine conditions and priority', () => {
      const graphConditionPriority: Graph = {
        entry: 'p1',
        edges: [
          { from: 'p1', to: 'p2', condition: { '==': [{ var: 'x' }, 1] }, priority: 10 },
          { from: 'p1', to: 'p3', condition: { '==': [{ var: 'x' }, 2] }, priority: 20 },
          { from: 'p1', to: 'p4', priority: 5 },
        ],
      };

      // When p3's condition is true, it should be selected (higher priority)
      let result = service.getNextPanel(graphConditionPriority, 'p1', { x: 2 });
      expect(result.nextPanelId).toBe('p3');

      // When only p2's condition is true
      result = service.getNextPanel(graphConditionPriority, 'p1', { x: 1 });
      expect(result.nextPanelId).toBe('p2');

      // When no conditions match, fallback
      result = service.getNextPanel(graphConditionPriority, 'p1', { x: 3 });
      expect(result.nextPanelId).toBe('p4');
    });
  });

  describe('getPossibleNextPanels', () => {
    it('should get all possible next panels', () => {
      const result = service.getPossibleNextPanels(branchingGraph, 'p1');
      expect(result).toContain('p2');
      expect(result).toContain('p3');
      expect(result.length).toBe(2);
    });

    it('should return empty array for endpoint', () => {
      const result = service.getPossibleNextPanels(linearGraph, 'p3');
      expect(result).toEqual([]);
    });
  });

  describe('getEdgesToPanel', () => {
    it('should get edges pointing to panel', () => {
      const edges = service.getEdgesToPanel(branchingGraph, 'p4');
      expect(edges.length).toBe(2);
      expect(edges.some((e) => e.from === 'p2')).toBe(true);
      expect(edges.some((e) => e.from === 'p3')).toBe(true);
    });

    it('should return empty for entry panel', () => {
      const edges = service.getEdgesToPanel(linearGraph, 'p1');
      expect(edges).toEqual([]);
    });
  });

  describe('getPreviousPanels', () => {
    it('should get previous panels', () => {
      const result = service.getPreviousPanels(branchingGraph, 'p4');
      expect(result).toContain('p2');
      expect(result).toContain('p3');
      expect(result.length).toBe(2);
    });

    it('should return empty for entry', () => {
      const result = service.getPreviousPanels(linearGraph, 'p1');
      expect(result).toEqual([]);
    });
  });

  describe('hasOutgoingEdges', () => {
    it('should return true when panel has outgoing edges', () => {
      expect(service.hasOutgoingEdges(linearGraph, 'p1')).toBe(true);
      expect(service.hasOutgoingEdges(linearGraph, 'p2')).toBe(true);
    });

    it('should return false for endpoint', () => {
      expect(service.hasOutgoingEdges(linearGraph, 'p3')).toBe(false);
    });
  });

  describe('isEndpoint', () => {
    it('should identify endpoint', () => {
      expect(service.isEndpoint(linearGraph, 'p3')).toBe(true);
    });

    it('should return false for non-endpoint', () => {
      expect(service.isEndpoint(linearGraph, 'p1')).toBe(false);
      expect(service.isEndpoint(linearGraph, 'p2')).toBe(false);
    });
  });

  describe('isEntry', () => {
    it('should identify entry panel (string)', () => {
      expect(service.isEntry(linearGraph, 'p1')).toBe(true);
    });

    it('should identify entry panel (array)', () => {
      const graphMultiEntry: Graph = {
        entry: ['p1', 'p2'],
        edges: [],
      };

      expect(service.isEntry(graphMultiEntry, 'p1')).toBe(true);
      expect(service.isEntry(graphMultiEntry, 'p2')).toBe(true);
      expect(service.isEntry(graphMultiEntry, 'p3')).toBe(false);
    });

    it('should return false for non-entry', () => {
      expect(service.isEntry(linearGraph, 'p2')).toBe(false);
    });
  });

  describe('getEntry', () => {
    it('should get entry panel', () => {
      expect(service.getEntry(linearGraph)).toBe('p1');
    });

    it('should get entry panels array', () => {
      const graphMultiEntry: Graph = {
        entry: ['p1', 'p2'],
        edges: [],
      };

      const entry = service.getEntry(graphMultiEntry);
      expect(Array.isArray(entry)).toBe(true);
      expect(entry).toEqual(['p1', 'p2']);
    });
  });

  describe('findEndpoints', () => {
    it('should find all endpoints', () => {
      const endpoints = service.findEndpoints(branchingGraph);
      expect(endpoints).toContain('p4');
      expect(endpoints.length).toBe(1);
    });

    it('should handle multiple endpoints', () => {
      const graphMultiEnd: Graph = {
        entry: 'p1',
        edges: [
          { from: 'p1', to: 'p2' },
          { from: 'p1', to: 'p3' },
        ],
      };

      const endpoints = service.findEndpoints(graphMultiEnd);
      expect(endpoints).toContain('p2');
      expect(endpoints).toContain('p3');
      expect(endpoints.length).toBe(2);
    });
  });

  describe('hasPath', () => {
    it('should find path when exists', () => {
      expect(service.hasPath(linearGraph, 'p1', 'p3')).toBe(true);
      expect(service.hasPath(linearGraph, 'p1', 'p2')).toBe(true);
    });

    it('should return false when no path exists', () => {
      expect(service.hasPath(linearGraph, 'p3', 'p1')).toBe(false);
    });

    it('should return true for same panel', () => {
      expect(service.hasPath(linearGraph, 'p1', 'p1')).toBe(true);
    });

    it('should handle cycles', () => {
      expect(service.hasPath(cyclicGraph, 'p1', 'p1')).toBe(true);
      expect(service.hasPath(cyclicGraph, 'p2', 'p2')).toBe(true);
    });
  });

  describe('findPath', () => {
    it('should find shortest path', () => {
      const path = service.findPath(linearGraph, 'p1', 'p3');
      expect(path).toEqual(['p1', 'p2', 'p3']);
    });

    it('should return null when no path exists', () => {
      const path = service.findPath(linearGraph, 'p3', 'p1');
      expect(path).toBeNull();
    });

    it('should return single-element array for same panel', () => {
      const path = service.findPath(linearGraph, 'p1', 'p1');
      expect(path).toEqual(['p1']);
    });

    it('should find shortest in branching graph', () => {
      const path = service.findPath(branchingGraph, 'p1', 'p4');
      expect(path).toBeDefined();
      expect(path![0]).toBe('p1');
      expect(path![path!.length - 1]).toBe('p4');
      expect(path!.length).toBe(3); // p1 -> p2/p3 -> p4
    });
  });

  describe('hasCycles', () => {
    it('should detect cycles', () => {
      expect(service.hasCycles(cyclicGraph)).toBe(true);
    });

    it('should return false for acyclic graph', () => {
      expect(service.hasCycles(linearGraph)).toBe(false);
      expect(service.hasCycles(branchingGraph)).toBe(false);
    });

    it('should handle self-loop', () => {
      const selfLoop: Graph = {
        entry: 'p1',
        edges: [{ from: 'p1', to: 'p1' }],
      };

      expect(service.hasCycles(selfLoop)).toBe(true);
    });
  });

  describe('getReachablePanels', () => {
    it('should get all reachable panels', () => {
      const reachable = service.getReachablePanels(linearGraph);
      expect(reachable).toContain('p1');
      expect(reachable).toContain('p2');
      expect(reachable).toContain('p3');
      expect(reachable.length).toBe(3);
    });

    it('should handle branching', () => {
      const reachable = service.getReachablePanels(branchingGraph);
      expect(reachable.length).toBe(4);
      expect(reachable).toContain('p1');
      expect(reachable).toContain('p2');
      expect(reachable).toContain('p3');
      expect(reachable).toContain('p4');
    });

    it('should handle cycles without infinite loop', () => {
      const reachable = service.getReachablePanels(cyclicGraph);
      expect(reachable).toContain('p1');
      expect(reachable).toContain('p2');
      expect(reachable).toContain('p3');
      expect(reachable.length).toBe(3);
    });
  });
});
