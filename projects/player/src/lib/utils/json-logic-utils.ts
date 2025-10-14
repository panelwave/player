/**
 * JSON Logic Utilities
 * Safe wrapper for json-logic-js with context creation
 */

import jsonLogic from 'json-logic-js';
import type { JsonLogic, VariableContext } from '../types';

/**
 * Safely evaluate a JSON Logic expression
 * 
 * @param logic - JSON Logic expression
 * @param context - Variable context for evaluation
 * @returns Evaluation result (typically boolean for conditions)
 * 
 * @example
 * ```typescript
 * const logic = { '>=': [{ var: 'user.age' }, 18] };
 * const context = { user: { age: 25 } };
 * 
 * evaluateJsonLogic(logic, context);
 * // Returns: true
 * 
 * // With missing variable
 * evaluateJsonLogic(logic, {});
 * // Returns: false (safe fallback)
 * ```
 */
export function evaluateJsonLogic(
  logic: JsonLogic | undefined,
  context: VariableContext
): boolean {
  // If no logic provided, consider it always true (no condition)
  if (logic === undefined || logic === null) {
    return true;
  }

  // If logic is a literal boolean, return it
  if (typeof logic === 'boolean') {
    return logic;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = jsonLogic.apply(logic as any, context);
    
    // Convert result to boolean
    return Boolean(result);
  } catch (error) {
    // Log error in development
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[JsonLogicUtils] Evaluation error:', error, {
        logic,
        context,
      });
    }
    
    // Default to false on error (fail closed)
    return false;
  }
}

/**
 * Create a flat variable context from nested variable store
 * 
 * @param variables - Variable store with scoped values
 * @returns Flat context object for JSON Logic
 * 
 * @example
 * ```typescript
 * const variables = {
 *   global: { version: '1.0' },
 *   session: { path: { choice: 'left' } },
 *   persistent: { prefs: { speech: true } }
 * };
 * 
 * createContext(variables);
 * // Returns: { version: '1.0', path: { choice: 'left' }, prefs: { speech: true } }
 * ```
 */
export function createContext(variables: Record<string, unknown>): VariableContext {
  const context: VariableContext = {};

  // Flatten all variable scopes into a single context
  Object.values(variables).forEach((scope) => {
    if (scope && typeof scope === 'object') {
      Object.assign(context, scope);
    }
  });

  return context;
}

/**
 * Validate JSON Logic expression structure
 * 
 * @param logic - JSON Logic expression to validate
 * @returns Validation result with errors if invalid
 * 
 * @example
 * ```typescript
 * validateJsonLogic({ '>=': [{ var: 'age' }, 18] });
 * // Returns: { valid: true }
 * 
 * validateJsonLogic({ 'invalid-op': [1, 2] });
 * // Returns: { valid: false, errors: ['Unknown operator: invalid-op'] }
 * ```
 */
export function validateJsonLogic(
  logic: JsonLogic
): { valid: boolean; errors?: string[] } {
  if (logic === null || logic === undefined) {
    return { valid: true };
  }

  // Literal values are valid
  if (
    typeof logic === 'boolean' ||
    typeof logic === 'number' ||
    typeof logic === 'string'
  ) {
    return { valid: true };
  }

  const errors: string[] = [];

  try {
    // Try to apply with empty context to check structure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jsonLogic.apply(logic as any, {});
    return { valid: true };
  } catch (error) {
    if (error instanceof Error) {
      errors.push(error.message);
    } else {
      errors.push('Unknown validation error');
    }
    return { valid: false, errors };
  }
}

/**
 * Extract variable names used in a JSON Logic expression
 * 
 * @param logic - JSON Logic expression
 * @returns Array of variable names referenced
 * 
 * @example
 * ```typescript
 * const logic = {
 *   and: [
 *     { '>=': [{ var: 'user.age' }, 18] },
 *     { '==': [{ var: 'prefs.speech' }, true] }
 *   ]
 * };
 * 
 * extractVariableNames(logic);
 * // Returns: ['user.age', 'prefs.speech']
 * ```
 */
export function extractVariableNames(logic: JsonLogic): string[] {
  const variables = new Set<string>();

  function traverse(node: unknown): void {
    if (node === null || node === undefined) {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(traverse);
      return;
    }

    if (typeof node === 'object') {
      // Check for { var: 'varName' } pattern
      const obj = node as Record<string, unknown>;
      
      if ('var' in obj && typeof obj['var'] === 'string') {
        variables.add(obj['var']);
      }

      // Recurse into all properties
      Object.values(obj).forEach(traverse);
    }
  }

  traverse(logic);
  return Array.from(variables);
}

/**
 * Add custom operators to JSON Logic
 * 
 * @example
 * ```typescript
 * // Add a custom 'contains' operator for arrays
 * addCustomOperator('contains', (array, value) => {
 *   return Array.isArray(array) && array.includes(value);
 * });
 * 
 * // Now can use in logic
 * const logic = { contains: [{ var: 'tags' }, 'featured'] };
 * evaluateJsonLogic(logic, { tags: ['new', 'featured'] });
 * // Returns: true
 * ```
 */
export function addCustomOperator(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  implementation: (...args: any[]) => any
): void {
  jsonLogic.add_operation(name, implementation);
}

/**
 * Remove a custom operator
 * 
 * @param name - Operator name to remove
 */
export function removeCustomOperator(name: string): void {
  jsonLogic.rm_operation(name);
}

/**
 * Common custom operators for PanelWave
 * Call this to register helpful custom operators
 */
export function registerPanelWaveOperators(): void {
  // Check if a value is in an array
  addCustomOperator('in', (value: unknown, array: unknown[]) => {
    return Array.isArray(array) && array.includes(value);
  });

  // Check if array contains a value (reverse of 'in')
  addCustomOperator('contains', (array: unknown[], value: unknown) => {
    return Array.isArray(array) && array.includes(value);
  });

  // Check if string matches regex pattern
  addCustomOperator('matches', (str: unknown, pattern: string) => {
    if (typeof str !== 'string') {
      return false;
    }
    try {
      return new RegExp(pattern).test(str);
    } catch {
      return false;
    }
  });

  // Check if value is between min and max (inclusive)
  addCustomOperator('between', (value: unknown, min: number, max: number) => {
    if (typeof value !== 'number') {
      return false;
    }
    return value >= min && value <= max;
  });

  // Get length of string or array
  addCustomOperator('length', (value: unknown) => {
    if (typeof value === 'string' || Array.isArray(value)) {
      return value.length;
    }
    return 0;
  });

  // Check if value is empty (null, undefined, '', [], {})
  addCustomOperator('isEmpty', (value: unknown) => {
    if (value === null || value === undefined || value === '') {
      return true;
    }
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    if (typeof value === 'object') {
      return Object.keys(value).length === 0;
    }
    return false;
  });
}

/**
 * Evaluate multiple conditions with AND logic
 * 
 * @param conditions - Array of JSON Logic expressions
 * @param context - Variable context
 * @returns True if all conditions evaluate to true
 */
export function evaluateAll(
  conditions: JsonLogic[],
  context: VariableContext
): boolean {
  if (!conditions || conditions.length === 0) {
    return true;
  }

  return conditions.every((condition) => evaluateJsonLogic(condition, context));
}

/**
 * Evaluate multiple conditions with OR logic
 * 
 * @param conditions - Array of JSON Logic expressions
 * @param context - Variable context
 * @returns True if any condition evaluates to true
 */
export function evaluateAny(
  conditions: JsonLogic[],
  context: VariableContext
): boolean {
  if (!conditions || conditions.length === 0) {
    return false;
  }

  return conditions.some((condition) => evaluateJsonLogic(condition, context));
}

/**
 * Test JSON Logic evaluation with sample data
 * Useful for debugging and validation
 * 
 * @param logic - JSON Logic expression
 * @param testCases - Array of test cases with context and expected result
 * @returns Test results
 */
export function testJsonLogic(
  logic: JsonLogic,
  testCases: { context: VariableContext; expected: boolean; description?: string }[]
): { passed: boolean; description?: string; actual?: boolean; expected: boolean }[] {
  return testCases.map((testCase) => {
    const actual = evaluateJsonLogic(logic, testCase.context);
    const passed = actual === testCase.expected;

    return {
      passed,
      description: testCase.description,
      actual,
      expected: testCase.expected,
    };
  });
}
