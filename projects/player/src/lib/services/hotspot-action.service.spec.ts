/**
 * Unit tests for HotspotActionService
 */

import { TestBed } from '@angular/core/testing';
import { HotspotActionService } from './hotspot-action.service';
import { VariableStoreService } from './variable-store.service';
import { PluginHostService } from './plugin-host.service';
import type { Transition } from '../types';

describe('HotspotActionService', () => {
  let service: HotspotActionService;
  let variableStore: jasmine.SpyObj<VariableStoreService>;
  let pluginHost: jasmine.SpyObj<PluginHostService>;

  beforeEach(() => {
    variableStore = jasmine.createSpyObj('VariableStoreService', ['applyMutations']);
    pluginHost = jasmine.createSpyObj('PluginHostService', ['emitEventToPlugins']);
    TestBed.configureTestingModule({
      providers: [
        HotspotActionService,
        { provide: VariableStoreService, useValue: variableStore },
        { provide: PluginHostService, useValue: pluginHost },
      ],
    });
    service = TestBed.inject(HotspotActionService);
  });

  it('goTo applies mutations first, then returns a navigate effect', () => {
    const transition = { type: 'slide' } as Transition;
    const effect = service.execute(
      { type: 'goTo', to: 'p2', mutations: [{ op: 'set', var: 'v', value: 1 }], transition },
      { chapterId: 'ch1' }
    );

    expect(variableStore.applyMutations).toHaveBeenCalledWith(
      [{ op: 'set', var: 'v', value: 1 }],
      { chapterId: 'ch1', pageId: undefined }
    );
    expect(effect).toEqual({ kind: 'navigate', to: 'p2', transition });
  });

  it('goTo without mutations skips the variable store', () => {
    const effect = service.execute({ type: 'goTo', to: 'p3' }, {});
    expect(variableStore.applyMutations).not.toHaveBeenCalled();
    expect(effect).toEqual({ kind: 'navigate', to: 'p3', transition: undefined });
  });

  it('setVariables applies mutations and returns none', () => {
    const effect = service.execute(
      { type: 'setVariables', mutations: [{ op: 'toggle', var: 'sound' }] },
      {}
    );
    expect(variableStore.applyMutations).toHaveBeenCalled();
    expect(effect).toEqual({ kind: 'none' });
  });

  it('openExtras returns the extras effect', () => {
    expect(service.execute({ type: 'openExtras', extrasId: 'bonus-1' }, {})).toEqual({
      kind: 'openExtras',
      extrasId: 'bonus-1',
    });
  });

  it('openModal returns title and content', () => {
    expect(
      service.execute(
        { type: 'openModal', title: { 'en-US': 'Hint' }, content: { 'en-US': 'Look closer.' } },
        {}
      )
    ).toEqual({ kind: 'openModal', title: { 'en-US': 'Hint' }, content: { 'en-US': 'Look closer.' } });
  });

  it('pluginEvent forwards to the plugin host and returns none', () => {
    const effect = service.execute(
      { type: 'pluginEvent', pluginId: 'quiz', event: 'start', payload: { level: 2 } },
      {}
    );
    expect(pluginHost.emitEventToPlugins).toHaveBeenCalledWith('start', {
      pluginId: 'quiz',
      payload: { level: 2 },
    });
    expect(effect).toEqual({ kind: 'none' });
  });
});
