/**
 * Unit tests for VariableStoreService
 */

import { TestBed } from '@angular/core/testing';
import { VariableStoreService } from './variable-store.service';
import type { VariableDefinition, VariableScope } from '../types';

describe('VariableStoreService', () => {
  let service: VariableStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VariableStoreService],
    });
    service = TestBed.inject(VariableStoreService);

    // Clear localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should have initial empty store', () => {
      const store = service.getStore();
      expect(store.global).toEqual({});
      expect(store.chapter).toEqual({});
      expect(store.page).toEqual({});
      expect(store.session).toEqual({});
      expect(store.persistent).toEqual({});
    });
  });

  describe('Variable Definitions', () => {
    const definitions: VariableDefinition[] = [
      {
        id: 'count',
        type: 'integer',
        scope: 'global',
        default: 0,
      },
      {
        id: 'name',
        type: 'string',
        scope: 'session',
        default: 'Player',
      },
      {
        id: 'enabled',
        type: 'boolean',
        scope: 'persistent',
        default: true,
      },
    ];

    it('should set variable definitions', () => {
      service.setDefinitions(definitions);
      
      // Defaults should be initialized
      expect(service.get('count', 'global')).toBe(0);
      expect(service.get('name', 'session')).toBe('Player');
      expect(service.get('enabled', 'persistent')).toBe(true);
    });

    it('should initialize variables with defaults', () => {
      service.setDefinitions(definitions);
      
      const store = service.getStore();
      expect(store.global['count']).toBe(0);
      expect(store.session['name']).toBe('Player');
      expect(store.persistent['enabled']).toBe(true);
    });
  });

  describe('Get and Set - Global Scope', () => {
    it('should set and get global variable', () => {
      service.set('test', 'value', 'global');
      expect(service.get('test', 'global')).toBe('value');
    });

    it('should return undefined for non-existent variable', () => {
      expect(service.get('nonexistent', 'global')).toBeUndefined();
    });

    it('should check if variable exists', () => {
      service.set('test', 'value', 'global');
      expect(service.has('test', 'global')).toBe(true);
      expect(service.has('nonexistent', 'global')).toBe(false);
    });

    it('should get scope variables', () => {
      service.set('var1', 'value1', 'global');
      service.set('var2', 'value2', 'global');
      
      const vars = service.getScopeVariables('global');
      expect(vars['var1']).toBe('value1');
      expect(vars['var2']).toBe('value2');
    });
  });

  describe('Get and Set - Chapter Scope', () => {
    it('should set and get chapter variable', () => {
      service.set('progress', 50, 'chapter', 'ch-1');
      expect(service.get('progress', 'chapter', 'ch-1')).toBe(50);
    });

    it('should isolate variables between chapters', () => {
      service.set('progress', 50, 'chapter', 'ch-1');
      service.set('progress', 75, 'chapter', 'ch-2');
      
      expect(service.get('progress', 'chapter', 'ch-1')).toBe(50);
      expect(service.get('progress', 'chapter', 'ch-2')).toBe(75);
    });

    it('should return undefined without scope ID', () => {
      service.set('test', 'value', 'chapter', 'ch-1');
      expect(service.get('test', 'chapter')).toBeUndefined();
    });

    it('should get chapter scope variables', () => {
      service.set('var1', 'value1', 'chapter', 'ch-1');
      service.set('var2', 'value2', 'chapter', 'ch-1');
      
      const vars = service.getScopeVariables('chapter', 'ch-1');
      expect(vars['var1']).toBe('value1');
      expect(vars['var2']).toBe('value2');
    });
  });

  describe('Get and Set - Page Scope', () => {
    it('should set and get page variable', () => {
      service.set('viewed', true, 'page', 'p-1');
      expect(service.get('viewed', 'page', 'p-1')).toBe(true);
    });

    it('should isolate variables between pages', () => {
      service.set('viewed', true, 'page', 'p-1');
      service.set('viewed', false, 'page', 'p-2');
      
      expect(service.get('viewed', 'page', 'p-1')).toBe(true);
      expect(service.get('viewed', 'page', 'p-2')).toBe(false);
    });
  });

  describe('Get and Set - Session Scope', () => {
    it('should set and get session variable', () => {
      service.set('tempData', 'temporary', 'session');
      expect(service.get('tempData', 'session')).toBe('temporary');
    });
  });

  describe('Get and Set - Persistent Scope', () => {
    it('should set and get persistent variable', () => {
      service.set('saveData', 'saved', 'persistent');
      expect(service.get('saveData', 'persistent')).toBe('saved');
    });

    it('should persist to localStorage', () => {
      if (typeof localStorage === 'undefined') {
        pending('localStorage not available');
        return;
      }

      service.set('saveData', 'saved', 'persistent');
      
      const stored = localStorage.getItem('pw-variables-persistent');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed['saveData']).toBe('saved');
    });

    it('should load from localStorage on init', () => {
      if (typeof localStorage === 'undefined') {
        pending('localStorage not available');
        return;
      }

      // Set data in localStorage
      localStorage.setItem('pw-variables-persistent', JSON.stringify({ loaded: 'fromStorage' }));
      
      // Create new service instance
      const newService = new VariableStoreService();
      
      expect(newService.get('loaded', 'persistent')).toBe('fromStorage');
    });
  });

  describe('Mutations - Set', () => {
    it('should apply set mutation', () => {
      service.applyMutation({ op: 'set', var: 'test', value: 'newValue' }, 'global');
      expect(service.get('test', 'global')).toBe('newValue');
    });
  });

  describe('Mutations - Increment', () => {
    it('should increment number', () => {
      service.set('count', 5, 'global');
      service.applyMutation({ op: 'increment', var: 'count' }, 'global');
      expect(service.get('count', 'global')).toBe(6);
    });

    it('should increment by custom amount', () => {
      service.set('count', 5, 'global');
      service.applyMutation({ op: 'increment', var: 'count', amount: 10 }, 'global');
      expect(service.get('count', 'global')).toBe(15);
    });

    it('should not increment non-number', () => {
      service.set('text', 'hello', 'global');
      service.applyMutation({ op: 'increment', var: 'text' }, 'global');
      expect(service.get('text', 'global')).toBe('hello'); // Unchanged
    });
  });

  describe('Mutations - Decrement', () => {
    it('should decrement number', () => {
      service.set('count', 5, 'global');
      service.applyMutation({ op: 'decrement', var: 'count' }, 'global');
      expect(service.get('count', 'global')).toBe(4);
    });

    it('should decrement by custom amount', () => {
      service.set('count', 20, 'global');
      service.applyMutation({ op: 'decrement', var: 'count', amount: 5 }, 'global');
      expect(service.get('count', 'global')).toBe(15);
    });
  });

  describe('Mutations - Toggle', () => {
    it('should toggle boolean', () => {
      service.set('flag', true, 'global');
      service.applyMutation({ op: 'toggle', var: 'flag' }, 'global');
      expect(service.get('flag', 'global')).toBe(false);
      
      service.applyMutation({ op: 'toggle', var: 'flag' }, 'global');
      expect(service.get('flag', 'global')).toBe(true);
    });

    it('should not toggle non-boolean', () => {
      service.set('text', 'hello', 'global');
      service.applyMutation({ op: 'toggle', var: 'text' }, 'global');
      expect(service.get('text', 'global')).toBe('hello'); // Unchanged
    });
  });

  describe('Mutations - Append', () => {
    it('should append to array', () => {
      service.set('list', [1, 2, 3], 'global');
      service.applyMutation({ op: 'append', var: 'list', value: 4 }, 'global');
      expect(service.get('list', 'global')).toEqual([1, 2, 3, 4]);
    });

    it('should create array if not exists', () => {
      service.applyMutation({ op: 'append', var: 'newList', value: 'first' }, 'global');
      expect(service.get('newList', 'global')).toEqual(['first']);
    });
  });

  describe('Mutations - Remove', () => {
    it('should remove from array', () => {
      service.set('list', [1, 2, 3, 2], 'global');
      service.applyMutation({ op: 'remove', var: 'list', value: 2 }, 'global');
      expect(service.get('list', 'global')).toEqual([1, 3]);
    });

    it('should do nothing if not array', () => {
      service.set('text', 'hello', 'global');
      service.applyMutation({ op: 'remove', var: 'text', value: 'h' }, 'global');
      expect(service.get('text', 'global')).toBe('hello'); // Unchanged
    });
  });

  describe('Mutations - Clear', () => {
    it('should clear to default value', () => {
      const definitions: VariableDefinition[] = [
        { id: 'count', type: 'integer', scope: 'global', default: 0 },
      ];
      service.setDefinitions(definitions);
      
      service.set('count', 100, 'global');
      service.applyMutation({ op: 'clear', var: 'count' }, 'global');
      expect(service.get('count', 'global')).toBe(0);
    });

    it('should clear to null if no default', () => {
      service.set('temp', 'value', 'global');
      service.applyMutation({ op: 'clear', var: 'temp' }, 'global');
      expect(service.get('temp', 'global')).toBeNull();
    });
  });

  describe('Type Validation', () => {
    beforeEach(() => {
      const definitions: VariableDefinition[] = [
        { id: 'count', type: 'integer', scope: 'global', min: 0, max: 100 },
        { id: 'name', type: 'string', scope: 'global', pattern: '^[A-Z]' },
        { id: 'enabled', type: 'boolean', scope: 'global' },
        { id: 'choice', type: 'enum', scope: 'global', enum: ['a', 'b', 'c'] },
      ];
      service.setDefinitions(definitions);
    });

    it('should validate integer type', () => {
      service.set('count', 50, 'global');
      expect(service.get('count', 'global')).toBe(50);
      
      // Invalid type
      service.set('count', 'invalid', 'global');
      expect(service.get('count', 'global')).toBe(50); // Unchanged
    });

    it('should validate integer range', () => {
      service.set('count', 50, 'global');
      expect(service.get('count', 'global')).toBe(50);
      
      // Out of range
      service.set('count', 150, 'global');
      expect(service.get('count', 'global')).toBe(50); // Unchanged
    });

    it('should validate string pattern', () => {
      service.set('name', 'Alice', 'global');
      expect(service.get('name', 'global')).toBe('Alice');
      
      // Invalid pattern
      service.set('name', 'alice', 'global');
      expect(service.get('name', 'global')).toBe('Alice'); // Unchanged
    });

    it('should validate boolean type', () => {
      service.set('enabled', true, 'global');
      expect(service.get('enabled', 'global')).toBe(true);
      
      // Invalid type
      service.set('enabled', 'yes', 'global');
      expect(service.get('enabled', 'global')).toBe(true); // Unchanged
    });

    it('should validate enum values', () => {
      service.set('choice', 'a', 'global');
      expect(service.get('choice', 'global')).toBe('a');
      
      // Invalid enum value
      service.set('choice', 'd', 'global');
      expect(service.get('choice', 'global')).toBe('a'); // Unchanged
    });
  });

  describe('Read-Only Variables', () => {
    beforeEach(() => {
      const definitions: VariableDefinition[] = [
        { id: 'readonly', type: 'string', scope: 'global', readOnly: true, default: 'fixed' },
      ];
      service.setDefinitions(definitions);
    });

    it('should not allow setting read-only variable', () => {
      expect(service.get('readonly', 'global')).toBe('fixed');
      
      service.set('readonly', 'changed', 'global');
      expect(service.get('readonly', 'global')).toBe('fixed'); // Unchanged
    });
  });

  describe('Reset Operations', () => {
    beforeEach(() => {
      service.set('var1', 'value1', 'global');
      service.set('var2', 'value2', 'session');
      service.set('var3', 'value3', 'chapter', 'ch-1');
      service.set('var4', 'value4', 'page', 'p-1');
      service.set('var5', 'value5', 'persistent');
    });

    it('should reset global scope', () => {
      service.resetScope('global');
      expect(service.get('var1', 'global')).toBeUndefined();
      expect(service.get('var2', 'session')).toBe('value2'); // Other scopes unchanged
    });

    it('should reset session scope', () => {
      service.resetScope('session');
      expect(service.get('var2', 'session')).toBeUndefined();
      expect(service.get('var1', 'global')).toBe('value1'); // Other scopes unchanged
    });

    it('should reset specific chapter', () => {
      service.set('test', 'ch2-value', 'chapter', 'ch-2');
      service.resetScope('chapter', 'ch-1');
      
      expect(service.get('var3', 'chapter', 'ch-1')).toBeUndefined();
      expect(service.get('test', 'chapter', 'ch-2')).toBe('ch2-value'); // Other chapters unchanged
    });

    it('should reset all chapters', () => {
      service.resetScope('chapter');
      expect(service.get('var3', 'chapter', 'ch-1')).toBeUndefined();
    });

    it('should reset persistent scope and clear storage', () => {
      if (typeof localStorage === 'undefined') {
        pending('localStorage not available');
        return;
      }

      service.resetScope('persistent');
      expect(service.get('var5', 'persistent')).toBeUndefined();
      
      const stored = localStorage.getItem('pw-variables-persistent');
      expect(stored).toBeNull();
    });

    it('should reset all scopes', () => {
      service.resetAll();
      
      expect(service.get('var1', 'global')).toBeUndefined();
      expect(service.get('var2', 'session')).toBeUndefined();
      expect(service.get('var3', 'chapter', 'ch-1')).toBeUndefined();
      expect(service.get('var4', 'page', 'p-1')).toBeUndefined();
      expect(service.get('var5', 'persistent')).toBeUndefined();
    });
  });

  describe('Context Creation', () => {
    beforeEach(() => {
      service.set('global1', 'g1', 'global');
      service.set('session1', 's1', 'session');
      service.set('persistent1', 'p1', 'persistent');
      service.set('chapter1', 'c1', 'chapter', 'ch-1');
      service.set('page1', 'pg1', 'page', 'p-1');
    });

    it('should create context with all scopes', () => {
      const context = service.createContext('ch-1', 'p-1');
      
      expect(context['global1']).toBe('g1');
      expect(context['session1']).toBe('s1');
      expect(context['persistent1']).toBe('p1');
      expect(context['chapter1']).toBe('c1');
      expect(context['page1']).toBe('pg1');
    });

    it('should create context without chapter/page', () => {
      const context = service.createContext();
      
      expect(context['global1']).toBe('g1');
      expect(context['session1']).toBe('s1');
      expect(context['persistent1']).toBe('p1');
      expect(context['chapter1']).toBeUndefined();
      expect(context['page1']).toBeUndefined();
    });

    it('should create context with only chapter', () => {
      const context = service.createContext('ch-1');
      
      expect(context['global1']).toBe('g1');
      expect(context['chapter1']).toBe('c1');
      expect(context['page1']).toBeUndefined();
    });

    it('should override with later scopes', () => {
      // Set same variable in multiple scopes
      service.set('override', 'global', 'global');
      service.set('override', 'chapter', 'chapter', 'ch-1');

      const context = service.createContext('ch-1');
      expect(context['override']).toBe('chapter'); // Chapter overrides global
    });

    it('should expand dot-namespaced keys into nested objects (json-logic var paths)', () => {
      service.set('path.choice', 'alley', 'session');
      service.set('path.visited', 3, 'session');
      service.set('user.age', 21, 'global');

      const context = service.createContext();
      expect(context['path']).toEqual({ choice: 'alley', visited: 3 });
      expect(context['user']).toEqual({ age: 21 });
      // Flat keys remain available as well.
      expect(context['path.choice']).toBe('alley');
    });

    it('should not clobber a non-object value when expanding dotted keys', () => {
      service.set('flag', 'plain', 'session');
      service.set('flag.sub', true, 'session');

      const context = service.createContext();
      expect(context['flag']).toBe('plain');
      expect(context['flag.sub']).toBe(true);
    });
  });

  describe('seed (privileged initialization)', () => {
    beforeEach(() => {
      service.setDefinitions([
        {
          id: 'user.age',
          type: 'number',
          scope: 'global',
          readOnly: true,
          visibility: 'private',
        },
        { id: 'style.mode', type: 'enum', enum: ['us', 'eu'], default: 'us', scope: 'session' },
      ]);
    });

    it('seeds read-only variables that set() must refuse', () => {
      // Runtime writes are rejected...
      service.set('user.age', 30, 'global');
      expect(service.get('user.age', 'global')).toBeUndefined();

      // ...but privileged seeding works.
      service.seed({ 'user.age': 12 });
      expect(service.get('user.age', 'global')).toBe(12);

      // And the value stays immune to later runtime writes/mutations.
      service.set('user.age', 99, 'global');
      service.applyMutation({ op: 'set', var: 'user.age', value: 99 }, 'global');
      expect(service.get('user.age', 'global')).toBe(12);
    });

    it('routes seeded values into the definition scope, undeclared ids into global', () => {
      service.seed({ 'style.mode': 'eu', loose: true });
      expect(service.get('style.mode', 'session')).toBe('eu');
      expect(service.get('loose', 'global')).toBe(true);
    });

    it('drops seed values that fail type validation', () => {
      service.seed({ 'user.age': 'not-a-number' });
      expect(service.get('user.age', 'global')).toBeUndefined();
      service.seed({ 'style.mode': 'invalid-option' });
      expect(service.get('style.mode', 'session')).toBe('us'); // default kept
    });
  });

  describe('Observable Store', () => {
    it('should emit store updates', (done) => {
      let emissionCount = 0;
      
      service.store.subscribe((store) => {
        emissionCount++;
        
        if (emissionCount === 2) {
          // Second emission after set
          expect(store.global['test']).toBe('value');
          done();
        }
      });
      
      service.set('test', 'value', 'global');
    });
  });

  describe('applyMutations', () => {
    it('applies a batch using each definition scope', () => {
      service.setDefinitions([
        { id: 'score', type: 'integer', scope: 'global', default: 0 },
        { id: 'seen', type: 'boolean', scope: 'chapter', default: false },
      ] as VariableDefinition[]);

      service.applyMutations(
        [
          { op: 'increment', var: 'score', value: 5 },
          { op: 'set', var: 'seen', value: true },
        ],
        { chapterId: 'ch1' }
      );

      expect(service.get('score', 'global')).toBe(5);
      expect(service.get('seen', 'chapter', 'ch1')).toBe(true);
    });

    it('defaults undeclared variables to session scope and never throws', () => {
      service.applyMutations([{ op: 'set', var: 'path.choice', value: 'left' }]);
      expect(service.get('path.choice', 'session')).toBe('left');
    });

    it('skips chapter-scoped mutations when no chapterId is provided', () => {
      service.setDefinitions([
        { id: 'seen', type: 'boolean', scope: 'chapter', default: false },
      ] as VariableDefinition[]);

      service.applyMutations([{ op: 'set', var: 'seen', value: true }]);
      expect(service.get('seen', 'chapter', 'ch1')).toBeUndefined();
    });
  });
});
