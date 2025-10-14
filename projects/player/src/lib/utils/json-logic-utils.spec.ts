/**
 * Unit tests for JSON Logic utilities
 */

import {
  evaluateJsonLogic,
  createContext,
  validateJsonLogic,
  extractVariableNames,
  registerPanelWaveOperators,
  evaluateAll,
  evaluateAny,
  testJsonLogic,
} from './json-logic-utils';

describe('JsonLogicUtils', () => {
  describe('evaluateJsonLogic', () => {
    it('should return true for undefined/null logic', () => {
      expect(evaluateJsonLogic(undefined, {})).toBe(true);
      expect(evaluateJsonLogic(null, {})).toBe(true);
    });

    it('should return literal boolean values', () => {
      expect(evaluateJsonLogic(true, {})).toBe(true);
      expect(evaluateJsonLogic(false, {})).toBe(false);
    });

    it('should evaluate simple comparisons', () => {
      const logic = { '>=': [{ var: 'age' }, 18] };
      expect(evaluateJsonLogic(logic, { age: 25 })).toBe(true);
      expect(evaluateJsonLogic(logic, { age: 16 })).toBe(false);
    });

    it('should evaluate equality', () => {
      const logic = { '==': [{ var: 'status' }, 'active'] };
      expect(evaluateJsonLogic(logic, { status: 'active' })).toBe(true);
      expect(evaluateJsonLogic(logic, { status: 'inactive' })).toBe(false);
    });

    it('should evaluate AND logic', () => {
      const logic = {
        and: [
          { '>=': [{ var: 'age' }, 18] },
          { '==': [{ var: 'verified' }, true] },
        ],
      };
      expect(evaluateJsonLogic(logic, { age: 25, verified: true })).toBe(true);
      expect(evaluateJsonLogic(logic, { age: 25, verified: false })).toBe(false);
      expect(evaluateJsonLogic(logic, { age: 16, verified: true })).toBe(false);
    });

    it('should evaluate OR logic', () => {
      const logic = {
        or: [
          { '==': [{ var: 'role' }, 'admin'] },
          { '==': [{ var: 'role' }, 'moderator'] },
        ],
      };
      expect(evaluateJsonLogic(logic, { role: 'admin' })).toBe(true);
      expect(evaluateJsonLogic(logic, { role: 'moderator' })).toBe(true);
      expect(evaluateJsonLogic(logic, { role: 'user' })).toBe(false);
    });

    it('should evaluate NOT logic', () => {
      const logic = { '!': [{ var: 'disabled' }] };
      expect(evaluateJsonLogic(logic, { disabled: false })).toBe(true);
      expect(evaluateJsonLogic(logic, { disabled: true })).toBe(false);
    });

    it('should handle missing variables gracefully', () => {
      const logic = { '>=': [{ var: 'age' }, 18] };
      expect(evaluateJsonLogic(logic, {})).toBe(false);
    });

    it('should handle nested variable paths', () => {
      const logic = { '==': [{ var: 'user.role' }, 'admin'] };
      expect(evaluateJsonLogic(logic, { user: { role: 'admin' } })).toBe(true);
      expect(evaluateJsonLogic(logic, { user: { role: 'user' } })).toBe(false);
    });

    it('should return false on evaluation error', () => {
      const invalidLogic = { 'unknown-op': [1, 2] } as any;
      // Should not throw, returns false
      expect(evaluateJsonLogic(invalidLogic, {})).toBe(false);
    });

    it('should convert non-boolean results to boolean', () => {
      const logic = { var: 'count' };
      expect(evaluateJsonLogic(logic, { count: 0 })).toBe(false);
      expect(evaluateJsonLogic(logic, { count: 5 })).toBe(true);
    });
  });

  describe('createContext', () => {
    it('should flatten nested scopes', () => {
      const variables = {
        global: { version: '1.0', debug: false },
        session: { userId: '123' },
        persistent: { theme: 'dark' },
      };

      const context = createContext(variables);
      expect(context['version']).toBe('1.0');
      expect(context['debug']).toBe(false);
      expect(context['userId']).toBe('123');
      expect(context['theme']).toBe('dark');
    });

    it('should handle empty scopes', () => {
      const variables = {
        global: {},
        session: {},
      };

      const context = createContext(variables);
      expect(Object.keys(context).length).toBe(0);
    });

    it('should skip non-object scopes', () => {
      const variables = {
        global: { test: 'value' },
        invalid: null as any,
        invalid2: 'string' as any,
      };

      const context = createContext(variables);
      expect(context['test']).toBe('value');
      expect(Object.keys(context).length).toBe(1);
    });

    it('should handle later scopes overriding earlier ones', () => {
      const variables = {
        global: { setting: 'global' },
        session: { setting: 'session' },
      };

      const context = createContext(variables);
      expect(context['setting']).toBe('session'); // Later wins
    });
  });

  describe('validateJsonLogic', () => {
    it('should validate null/undefined as valid', () => {
      expect(validateJsonLogic(null).valid).toBe(true);
      expect(validateJsonLogic(undefined as any).valid).toBe(true);
    });

    it('should validate literal values as valid', () => {
      expect(validateJsonLogic(true).valid).toBe(true);
      expect(validateJsonLogic(false).valid).toBe(true);
      expect(validateJsonLogic(42).valid).toBe(true);
      expect(validateJsonLogic('test').valid).toBe(true);
    });

    it('should validate correct logic structure', () => {
      const logic = { '>=': [{ var: 'age' }, 18] };
      const result = validateJsonLogic(logic);
      expect(result.valid).toBe(true);
    });

    it('should accept complex nested logic', () => {
      const logic = {
        and: [
          { '>=': [{ var: 'age' }, 18] },
          { or: [{ '==': [{ var: 'role' }, 'admin'] }, { '==': [{ var: 'verified' }, true] }] },
        ],
      };
      const result = validateJsonLogic(logic);
      expect(result.valid).toBe(true);
    });

    it('should handle arrays', () => {
      const logic = [{ '>=': [{ var: 'age' }, 18] }];
      const result = validateJsonLogic(logic as any);
      expect(result.valid).toBe(true);
    });
  });

  describe('extractVariableNames', () => {
    it('should extract single variable', () => {
      const logic = { '>=': [{ var: 'age' }, 18] };
      const vars = extractVariableNames(logic);
      expect(vars).toEqual(['age']);
    });

    it('should extract multiple variables', () => {
      const logic = {
        and: [{ '>=': [{ var: 'age' }, 18] }, { '==': [{ var: 'verified' }, true] }],
      };
      const vars = extractVariableNames(logic);
      expect(vars).toContain('age');
      expect(vars).toContain('verified');
      expect(vars.length).toBe(2);
    });

    it('should extract nested variable paths', () => {
      const logic = { '==': [{ var: 'user.role' }, 'admin'] };
      const vars = extractVariableNames(logic);
      expect(vars).toEqual(['user.role']);
    });

    it('should not duplicate variables', () => {
      const logic = {
        and: [{ '>=': [{ var: 'age' }, 18] }, { '<=': [{ var: 'age' }, 65] }],
      };
      const vars = extractVariableNames(logic);
      expect(vars.filter((v) => v === 'age').length).toBe(1);
    });

    it('should return empty array for no variables', () => {
      const logic = { '==': [1, 2] };
      const vars = extractVariableNames(logic);
      expect(vars.length).toBe(0);
    });

    it('should handle null/undefined', () => {
      expect(extractVariableNames(null).length).toBe(0);
      expect(extractVariableNames(undefined as any).length).toBe(0);
    });
  });

  describe('PanelWave custom operators', () => {
    beforeAll(() => {
      registerPanelWaveOperators();
    });

    describe('in operator', () => {
      it('should check if value is in array', () => {
        const logic = { in: [{ var: 'choice' }, ['left', 'right', 'center']] };
        expect(evaluateJsonLogic(logic, { choice: 'left' })).toBe(true);
        expect(evaluateJsonLogic(logic, { choice: 'up' })).toBe(false);
      });
    });

    describe('contains operator', () => {
      it('should check if array contains value', () => {
        const logic = { contains: [{ var: 'tags' }, 'featured'] };
        expect(evaluateJsonLogic(logic, { tags: ['new', 'featured'] })).toBe(true);
        expect(evaluateJsonLogic(logic, { tags: ['new', 'old'] })).toBe(false);
      });
    });

    describe('matches operator', () => {
      it('should match regex pattern', () => {
        const logic = { matches: [{ var: 'email' }, '^[a-z]+@[a-z]+\\.[a-z]+$'] };
        expect(evaluateJsonLogic(logic, { email: 'test@example.com' })).toBe(true);
        expect(evaluateJsonLogic(logic, { email: 'invalid' })).toBe(false);
      });

      it('should handle non-string values', () => {
        const logic = { matches: [{ var: 'value' }, 'pattern'] };
        expect(evaluateJsonLogic(logic, { value: 123 })).toBe(false);
      });

      it('should handle invalid regex gracefully', () => {
        const logic = { matches: [{ var: 'value' }, '[invalid('] };
        expect(evaluateJsonLogic(logic, { value: 'test' })).toBe(false);
      });
    });

    describe('between operator', () => {
      it('should check if value is between min and max', () => {
        const logic = { between: [{ var: 'age' }, 18, 65] };
        expect(evaluateJsonLogic(logic, { age: 25 })).toBe(true);
        expect(evaluateJsonLogic(logic, { age: 18 })).toBe(true); // Inclusive
        expect(evaluateJsonLogic(logic, { age: 65 })).toBe(true); // Inclusive
        expect(evaluateJsonLogic(logic, { age: 17 })).toBe(false);
        expect(evaluateJsonLogic(logic, { age: 66 })).toBe(false);
      });

      it('should handle non-number values', () => {
        const logic = { between: [{ var: 'value' }, 1, 10] };
        expect(evaluateJsonLogic(logic, { value: 'text' })).toBe(false);
      });
    });

    describe('length operator', () => {
      it('should get length of string', () => {
        const logic = { '>=': [{ length: [{ var: 'name' }] }, 3] };
        expect(evaluateJsonLogic(logic, { name: 'John' })).toBe(true);
        expect(evaluateJsonLogic(logic, { name: 'Jo' })).toBe(false);
      });

      it('should get length of array', () => {
        const logic = { '>': [{ length: [{ var: 'items' }] }, 0] };
        expect(evaluateJsonLogic(logic, { items: [1, 2, 3] })).toBe(true);
        expect(evaluateJsonLogic(logic, { items: [] })).toBe(false);
      });

      it('should return 0 for non-string/array', () => {
        const logic = { '==': [{ length: [{ var: 'value' }] }, 0] };
        expect(evaluateJsonLogic(logic, { value: 123 })).toBe(true);
      });
    });

    describe('isEmpty operator', () => {
      it('should detect empty string', () => {
        const logic = { isEmpty: [{ var: 'value' }] };
        expect(evaluateJsonLogic(logic, { value: '' })).toBe(true);
        expect(evaluateJsonLogic(logic, { value: 'text' })).toBe(false);
      });

      it('should detect empty array', () => {
        const logic = { isEmpty: [{ var: 'items' }] };
        expect(evaluateJsonLogic(logic, { items: [] })).toBe(true);
        expect(evaluateJsonLogic(logic, { items: [1] })).toBe(false);
      });

      it('should detect null/undefined', () => {
        const logic = { isEmpty: [{ var: 'value' }] };
        expect(evaluateJsonLogic(logic, { value: null })).toBe(true);
        expect(evaluateJsonLogic(logic, { value: undefined })).toBe(true);
      });

      it('should detect empty object', () => {
        const logic = { isEmpty: [{ var: 'obj' }] };
        expect(evaluateJsonLogic(logic, { obj: {} })).toBe(true);
        expect(evaluateJsonLogic(logic, { obj: { key: 'value' } })).toBe(false);
      });
    });
  });

  describe('evaluateAll', () => {
    it('should return true when all conditions are true', () => {
      const conditions = [
        { '>=': [{ var: 'age' }, 18] },
        { '==': [{ var: 'verified' }, true] },
      ];
      const context = { age: 25, verified: true };
      expect(evaluateAll(conditions, context)).toBe(true);
    });

    it('should return false when any condition is false', () => {
      const conditions = [
        { '>=': [{ var: 'age' }, 18] },
        { '==': [{ var: 'verified' }, true] },
      ];
      const context = { age: 25, verified: false };
      expect(evaluateAll(conditions, context)).toBe(false);
    });

    it('should return true for empty array', () => {
      expect(evaluateAll([], {})).toBe(true);
    });

    it('should handle null/undefined', () => {
      expect(evaluateAll(null as any, {})).toBe(true);
      expect(evaluateAll(undefined as any, {})).toBe(true);
    });
  });

  describe('evaluateAny', () => {
    it('should return true when any condition is true', () => {
      const conditions = [
        { '==': [{ var: 'role' }, 'admin'] },
        { '==': [{ var: 'role' }, 'moderator'] },
      ];
      expect(evaluateAny(conditions, { role: 'admin' })).toBe(true);
      expect(evaluateAny(conditions, { role: 'moderator' })).toBe(true);
    });

    it('should return false when all conditions are false', () => {
      const conditions = [
        { '==': [{ var: 'role' }, 'admin'] },
        { '==': [{ var: 'role' }, 'moderator'] },
      ];
      expect(evaluateAny(conditions, { role: 'user' })).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(evaluateAny([], {})).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(evaluateAny(null as any, {})).toBe(false);
      expect(evaluateAny(undefined as any, {})).toBe(false);
    });
  });

  describe('testJsonLogic', () => {
    it('should run test cases and return results', () => {
      const logic = { '>=': [{ var: 'age' }, 18] };
      const testCases = [
        { context: { age: 25 }, expected: true, description: 'Adult' },
        { context: { age: 16 }, expected: false, description: 'Minor' },
        { context: { age: 18 }, expected: true, description: 'Exactly 18' },
      ];

      const results = testJsonLogic(logic, testCases);
      expect(results.length).toBe(3);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(true);
      expect(results[2].passed).toBe(true);
    });

    it('should identify failed tests', () => {
      const logic = { '==': [{ var: 'status' }, 'active'] };
      const testCases = [
        { context: { status: 'active' }, expected: false }, // Wrong expectation
      ];

      const results = testJsonLogic(logic, testCases);
      expect(results[0].passed).toBe(false);
      expect(results[0].actual).toBe(true);
      expect(results[0].expected).toBe(false);
    });

    it('should include descriptions in results', () => {
      const logic = { '>': [{ var: 'count' }, 0] };
      const testCases = [{ context: { count: 5 }, expected: true, description: 'Has items' }];

      const results = testJsonLogic(logic, testCases);
      expect(results[0].description).toBe('Has items');
    });
  });
});
