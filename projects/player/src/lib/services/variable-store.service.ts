/**
 * Variable Store Service
 * Manages scoped variable storage with persistence and mutations
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type {
  VariableStore,
  VariableScope,
  VariableMutation,
  MutationOperation,
  VariableContext,
  VariableDefinition,
} from '../types';

/**
 * Variable Store Service
 * Provides scoped variable storage with mutations and persistence
 */
@Injectable({
  providedIn: 'root',
})
export class VariableStoreService {
  private readonly store$ = new BehaviorSubject<VariableStore>(this.createInitialStore());
  private definitions = new Map<string, VariableDefinition>();

  // Observable store
  readonly store: Observable<VariableStore> = this.store$.asObservable();

  constructor() {
    // Load persistent variables from storage
    this.loadPersistentVariables();
  }

  /**
   * Create initial empty store
   */
  private createInitialStore(): VariableStore {
    return {
      global: {},
      chapter: {},
      page: {},
      session: {},
      persistent: {},
    };
  }

  /**
   * Get current store snapshot
   */
  getStore(): VariableStore {
    return this.store$.value;
  }

  /**
   * Set variable definitions
   * @param definitions - Array of variable definitions
   */
  setDefinitions(definitions: VariableDefinition[]): void {
    this.definitions.clear();
    definitions.forEach((def) => {
      this.definitions.set(def.id, def);
    });

    // Initialize variables with defaults
    this.initializeDefaults();
  }

  /**
   * Initialize variables with default values
   */
  private initializeDefaults(): void {
    this.definitions.forEach((def) => {
      if (def.default !== undefined) {
        // Use internal set to bypass read-only check for initialization
        this.setInternal(def.id, def.default, def.scope);
      }
    });
  }

  /**
   * Get a variable value
   * @param id - Variable identifier
   * @param scope - Variable scope
   * @param scopeId - Scope identifier (for chapter/page scopes)
   * @returns Variable value or undefined
   */
  get(id: string, scope: VariableScope, scopeId?: string): unknown {
    const store = this.store$.value;

    switch (scope) {
      case 'global':
        return store.global[id];

      case 'chapter':
        if (!scopeId) return undefined;
        return store.chapter[scopeId]?.[id];

      case 'page':
        if (!scopeId) return undefined;
        return store.page[scopeId]?.[id];

      case 'session':
        return store.session[id];

      case 'persistent':
        return store.persistent[id];

      default:
        return undefined;
    }
  }

  /**
   * Set a variable value
   * @param id - Variable identifier
   * @param value - Variable value
   * @param scope - Variable scope
   * @param scopeId - Scope identifier (for chapter/page scopes)
   */
  set(id: string, value: unknown, scope: VariableScope, scopeId?: string): void {
    // Check if variable is read-only
    const def = this.definitions.get(id);
    if (def?.readOnly) {
      console.warn(`[VariableStore] Cannot set read-only variable: ${id}`);
      return;
    }

    // Validate type
    if (def && !this.validateType(value, def)) {
      console.warn(`[VariableStore] Type validation failed for ${id}`);
      return;
    }

    this.setInternal(id, value, scope, scopeId);
  }

  /**
   * Privileged initialization write for host-supplied values (the shell's
   * `initialVariables` input, the entitlement adapter's context). Unlike
   * `set()`, this MAY seed `readOnly` variables — that is exactly how an
   * externally-sourced value (e.g. a verified `user.age`) gets in while
   * staying immune to in-story mutations and settings edits. Types are
   * still validated against the definition; invalid values are dropped
   * with a warning. Each value lands in its definition's declared scope
   * (undeclared ids default to `global`).
   */
  seed(values: Record<string, unknown>): void {
    Object.entries(values).forEach(([id, value]) => {
      const def = this.definitions.get(id);
      if (def && !this.validateType(value, def)) {
        console.warn(`[VariableStore] Seed value for "${id}" failed type validation - dropped`);
        return;
      }
      this.setInternal(id, value, def?.scope ?? 'global');
    });
  }

  /**
   * Internal set method (bypasses read-only and validation checks)
   */
  private setInternal(id: string, value: unknown, scope: VariableScope, scopeId?: string): void {
    const store = this.store$.value;

    switch (scope) {
      case 'global':
        store.global[id] = value;
        break;

      case 'chapter':
        if (!scopeId) return;
        if (!store.chapter[scopeId]) {
          store.chapter[scopeId] = {};
        }
        store.chapter[scopeId][id] = value;
        break;

      case 'page':
        if (!scopeId) return;
        if (!store.page[scopeId]) {
          store.page[scopeId] = {};
        }
        store.page[scopeId][id] = value;
        break;

      case 'session':
        store.session[id] = value;
        break;

      case 'persistent':
        store.persistent[id] = value;
        this.persistVariable(id, value);
        break;
    }

    // Emit updated store
    this.store$.next({ ...store });
  }

  /**
   * Apply a variable mutation
   * @param mutation - Mutation to apply
   * @param scope - Variable scope
   * @param scopeId - Scope identifier (for chapter/page scopes)
   */
  applyMutation(mutation: VariableMutation, scope: VariableScope, scopeId?: string): void {
    const currentValue = this.get(mutation.var, scope, scopeId);

    switch (mutation.op) {
      case 'set':
        this.set(mutation.var, mutation.value, scope, scopeId);
        break;

      case 'increment':
        if (typeof currentValue === 'number') {
          const amount = mutation.amount ?? 1;
          this.set(mutation.var, currentValue + amount, scope, scopeId);
        }
        break;

      case 'decrement':
        if (typeof currentValue === 'number') {
          const amount = mutation.amount ?? 1;
          this.set(mutation.var, currentValue - amount, scope, scopeId);
        }
        break;

      case 'toggle':
        if (typeof currentValue === 'boolean') {
          this.set(mutation.var, !currentValue, scope, scopeId);
        }
        break;

      case 'append':
        if (Array.isArray(currentValue)) {
          this.set(mutation.var, [...currentValue, mutation.value], scope, scopeId);
        } else {
          this.set(mutation.var, [mutation.value], scope, scopeId);
        }
        break;

      case 'remove':
        if (Array.isArray(currentValue)) {
          const filtered = currentValue.filter((item) => item !== mutation.value);
          this.set(mutation.var, filtered, scope, scopeId);
        }
        break;

      case 'clear':
        const def = this.definitions.get(mutation.var);
        const defaultValue = def?.default ?? null;
        this.set(mutation.var, defaultValue, scope, scopeId);
        break;
    }
  }

  /**
   * Apply a manifest Mutation[] (hotspot/edge actions). Scope comes from the
   * variable's definition; undeclared variables fall back to session scope.
   * The schema's `increment` carries its delta in `value`, so a numeric value
   * is mapped onto the store's `amount`.
   * @param mutations - Mutations in manifest shape ({ op, var, value? })
   * @param ids - Scope identifiers for chapter/page-scoped variables
   */
  applyMutations(
    mutations: Array<{ op: string; var: string; value?: unknown }>,
    ids?: { chapterId?: string; pageId?: string }
  ): void {
    for (const m of mutations ?? []) {
      const def = this.definitions.get(m.var);
      const scope: VariableScope = def?.scope ?? 'session';
      const scopeId =
        scope === 'chapter' ? ids?.chapterId : scope === 'page' ? ids?.pageId : undefined;
      if ((scope === 'chapter' || scope === 'page') && !scopeId) {
        continue;
      }
      this.applyMutation(
        {
          op: m.op,
          var: m.var,
          value: m.value,
          amount: typeof m.value === 'number' ? m.value : undefined,
        } as VariableMutation,
        scope,
        scopeId
      );
    }
  }

  /**
   * Reset a scope
   * @param scope - Scope to reset
   * @param scopeId - Scope identifier (for chapter/page scopes)
   */
  resetScope(scope: VariableScope, scopeId?: string): void {
    const store = this.store$.value;

    switch (scope) {
      case 'global':
        store.global = {};
        break;

      case 'chapter':
        if (scopeId) {
          delete store.chapter[scopeId];
        } else {
          store.chapter = {};
        }
        break;

      case 'page':
        if (scopeId) {
          delete store.page[scopeId];
        } else {
          store.page = {};
        }
        break;

      case 'session':
        store.session = {};
        break;

      case 'persistent':
        store.persistent = {};
        this.clearPersistentStorage();
        break;
    }

    this.store$.next({ ...store });

    // Re-initialize defaults for the reset scope
    this.initializeDefaultsForScope(scope, scopeId);
  }

  /**
   * Initialize defaults for a specific scope
   */
  private initializeDefaultsForScope(scope: VariableScope, scopeId?: string): void {
    this.definitions.forEach((def) => {
      if (def.scope === scope && def.default !== undefined) {
        this.set(def.id, def.default, scope, scopeId);
      }
    });
  }

  /**
   * Create a flat context for JSON Logic evaluation
   * @param chapterId - Current chapter ID
   * @param pageId - Current page ID
   * @returns Flat variable context
   */
  createContext(chapterId?: string, pageId?: string): VariableContext {
    const store = this.store$.value;
    const context: VariableContext = {};

    // Add global variables
    Object.assign(context, store.global);

    // Add session variables
    Object.assign(context, store.session);

    // Add persistent variables
    Object.assign(context, store.persistent);

    // Add chapter-specific variables
    if (chapterId && store.chapter[chapterId]) {
      Object.assign(context, store.chapter[chapterId]);
    }

    // Add page-specific variables
    if (pageId && store.page[pageId]) {
      Object.assign(context, store.page[pageId]);
    }

    // json-logic-js resolves {"var": "path.choice"} by splitting on '.'
    // and traversing nested objects, but variables are stored under
    // their flat dotted key. Expand dotted keys into nested structures
    // so manifest conditions (edges, visibleIf, variants) can reference
    // dot-namespaced variable ids. The flat key is kept as well.
    this.expandDottedKeys(context);

    return context;
  }

  /**
   * Expand flat dotted keys ('path.choice') into nested objects
   * ({ path: { choice } }), merging into any existing plain object and
   * never clobbering non-object values on the way down.
   */
  private expandDottedKeys(context: VariableContext): void {
    for (const key of Object.keys(context)) {
      if (!key.includes('.')) {
        continue;
      }
      const parts = key.split('.');
      let node: Record<string, unknown> = context;
      let ok = true;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const existing = node[part];
        if (existing === undefined || existing === null) {
          const child: Record<string, unknown> = {};
          node[part] = child;
          node = child;
        } else if (typeof existing === 'object' && !Array.isArray(existing)) {
          node = existing as Record<string, unknown>;
        } else {
          // A non-object value occupies this segment - leave it alone.
          ok = false;
          break;
        }
      }
      if (ok) {
        node[parts[parts.length - 1]] = context[key];
      }
    }
  }

  /**
   * Get all variables in a scope
   * @param scope - Variable scope
   * @param scopeId - Scope identifier (for chapter/page scopes)
   * @returns Record of variables
   */
  getScopeVariables(scope: VariableScope, scopeId?: string): Record<string, unknown> {
    const store = this.store$.value;

    switch (scope) {
      case 'global':
        return { ...store.global };

      case 'chapter':
        return scopeId && store.chapter[scopeId] ? { ...store.chapter[scopeId] } : {};

      case 'page':
        return scopeId && store.page[scopeId] ? { ...store.page[scopeId] } : {};

      case 'session':
        return { ...store.session };

      case 'persistent':
        return { ...store.persistent };

      default:
        return {};
    }
  }

  /**
   * Check if a variable exists
   * @param id - Variable identifier
   * @param scope - Variable scope
   * @param scopeId - Scope identifier (for chapter/page scopes)
   * @returns True if variable exists
   */
  has(id: string, scope: VariableScope, scopeId?: string): boolean {
    return this.get(id, scope, scopeId) !== undefined;
  }

  /**
   * Validate variable type
   */
  private validateType(value: unknown, def: VariableDefinition): boolean {
    switch (def.type) {
      case 'boolean':
        return typeof value === 'boolean';

      case 'number':
      case 'integer':
        if (typeof value !== 'number') return false;
        if (def.type === 'integer' && !Number.isInteger(value)) return false;
        if (def.min !== undefined && value < def.min) return false;
        if (def.max !== undefined && value > def.max) return false;
        return true;

      case 'string':
        if (typeof value !== 'string') return false;
        if (def.pattern) {
          try {
            return new RegExp(def.pattern).test(value);
          } catch {
            return false;
          }
        }
        return true;

      case 'enum':
        return def.enum ? def.enum.includes(value as string) : false;

      case 'date':
      case 'time':
      case 'datetime':
        return typeof value === 'string';

      default:
        return true;
    }
  }

  /**
   * Load persistent variables from localStorage
   */
  private loadPersistentVariables(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem('pw-variables-persistent');
      if (stored) {
        const persistent = JSON.parse(stored);
        const store = this.store$.value;
        store.persistent = persistent;
        this.store$.next({ ...store });
      }
    } catch (error) {
      console.warn('[VariableStore] Failed to load persistent variables:', error);
    }
  }

  /**
   * Persist a single variable to localStorage
   */
  private persistVariable(id: string, value: unknown): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const store = this.store$.value;
      localStorage.setItem('pw-variables-persistent', JSON.stringify(store.persistent));
    } catch (error) {
      console.warn('[VariableStore] Failed to persist variable:', error);
    }
  }

  /**
   * Clear persistent storage
   */
  private clearPersistentStorage(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem('pw-variables-persistent');
    } catch (error) {
      console.warn('[VariableStore] Failed to clear persistent storage:', error);
    }
  }

  /**
   * Reset all scopes
   */
  resetAll(): void {
    this.store$.next(this.createInitialStore());
    this.clearPersistentStorage();
    this.initializeDefaults();
  }
}
