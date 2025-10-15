/**
 * EntitlementService Tests
 * Comprehensive test coverage for entitlement and paywall functionality
 */

import { TestBed } from '@angular/core/testing';
import { EntitlementService } from './entitlement.service';
import type {
  EntitlementAdapter,
  EntitlementContext,
  EntitlementStatus,
  PaywallGate,
  UserInfo,
} from '../types/entitlement.types';
import { NullEntitlementAdapter, MockEntitlementAdapter } from '../types/entitlement.types';

describe('EntitlementService', () => {
  let service: EntitlementService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EntitlementService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Default Adapter', () => {
    it('should initialize with NullEntitlementAdapter', () => {
      const adapter = service.getAdapter();
      expect(adapter).toBeInstanceOf(NullEntitlementAdapter);
    });

    it('should deny access by default', async () => {
      const hasAccess = await service.hasAccessToWork('test-work');
      expect(hasAccess).toBe(false);
    });
  });

  describe('setAdapter', () => {
    it('should set a new adapter', () => {
      const mockAdapter = new MockEntitlementAdapter();
      service.setAdapter(mockAdapter);
      expect(service.getAdapter()).toBe(mockAdapter);
    });

    it('should clear cache when adapter is set', async () => {
      // First check with null adapter
      await service.checkEntitlement({ workId: 'test' });
      
      // Set mock adapter
      service.setAdapter(new MockEntitlementAdapter());
      
      // Check again should use new adapter
      const status = await service.checkEntitlement({ workId: 'test' });
      expect(status.ok).toBe(true);
    });

    it('should update current user when adapter is set', async () => {
      const mockUser: UserInfo = {
        id: 'test-user',
        displayName: 'Test User',
      };
      
      const mockAdapter = new MockEntitlementAdapter(mockUser);
      service.setAdapter(mockAdapter);
      
      // Wait for async getCurrentUser
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const user = await service.getCurrentUser();
      expect(user).toEqual(mockUser);
    });
  });

  describe('checkEntitlement', () => {
    beforeEach(() => {
      service.setAdapter(new MockEntitlementAdapter());
    });

    it('should resolve entitlement for a work', async () => {
      const context: EntitlementContext = {
        workId: 'test-work',
      };
      
      const status = await service.checkEntitlement(context);
      expect(status.ok).toBe(true);
      expect(status.entitlements).toBeDefined();
    });

    it('should resolve entitlement for a chapter', async () => {
      const context: EntitlementContext = {
        workId: 'test-work',
        chapterId: 'chapter-1',
      };
      
      const status = await service.checkEntitlement(context);
      expect(status.ok).toBe(true);
    });

    it('should resolve entitlement for a panel', async () => {
      const context: EntitlementContext = {
        workId: 'test-work',
        chapterId: 'chapter-1',
        panelId: 'panel-1',
      };
      
      const status = await service.checkEntitlement(context);
      expect(status.ok).toBe(true);
    });

    it('should cache entitlement results', async () => {
      const context: EntitlementContext = { workId: 'test-work' };
      
      const adapter = jasmine.createSpyObj('EntitlementAdapter', ['resolveEntitlement']);
      adapter.resolveEntitlement.and.returnValue(Promise.resolve({
        ok: true,
        entitlements: {},
      }));
      
      service.setAdapter(adapter);
      
      // First call
      await service.checkEntitlement(context);
      // Second call (should use cache)
      await service.checkEntitlement(context);
      
      expect(adapter.resolveEntitlement).toHaveBeenCalledTimes(1);
    });

    it('should update current user from entitlement status', async () => {
      const mockUser: UserInfo = {
        id: 'user-1',
        displayName: 'Test User',
      };
      
      const adapter = jasmine.createSpyObj('EntitlementAdapter', ['resolveEntitlement']);
      adapter.resolveEntitlement.and.returnValue(Promise.resolve({
        ok: true,
        entitlements: {},
        user: mockUser,
      }));
      
      service.setAdapter(adapter);
      
      await service.checkEntitlement({ workId: 'test' });
      
      const user = await service.getCurrentUser();
      expect(user).toEqual(mockUser);
    });
  });

  describe('hasAccessToWork', () => {
    it('should check work-level access', async () => {
      service.setAdapter(new MockEntitlementAdapter());
      
      const hasAccess = await service.hasAccessToWork('test-work');
      expect(hasAccess).toBe(true);
    });
  });

  describe('hasAccessToChapter', () => {
    it('should check chapter-level access', async () => {
      service.setAdapter(new MockEntitlementAdapter());
      
      const hasAccess = await service.hasAccessToChapter('test-work', 'chapter-1');
      expect(hasAccess).toBe(true);
    });
  });

  describe('hasAccessToPanel', () => {
    it('should check panel-level access', async () => {
      service.setAdapter(new MockEntitlementAdapter());
      
      const hasAccess = await service.hasAccessToPanel('test-work', 'chapter-1', 'panel-1');
      expect(hasAccess).toBe(true);
    });
  });

  describe('getSignedUrl', () => {
    it('should get signed URL from adapter', async () => {
      const adapter = jasmine.createSpyObj('EntitlementAdapter', ['getSignedUrl']);
      adapter.getSignedUrl.and.returnValue(Promise.resolve('https://signed.url'));
      
      service.setAdapter(adapter);
      
      const url = await service.getSignedUrl('asset-123');
      expect(url).toBe('https://signed.url');
      expect(adapter.getSignedUrl).toHaveBeenCalledWith('asset-123', 'stream');
    });

    it('should return asset ID if adapter does not support signing', async () => {
      const adapter = {} as EntitlementAdapter;
      adapter.resolveEntitlement = jasmine.createSpy().and.returnValue(Promise.resolve({
        ok: true,
        entitlements: {},
      }));
      
      service.setAdapter(adapter);
      
      const url = await service.getSignedUrl('asset-123');
      expect(url).toBe('asset-123');
    });

    it('should support download purpose', async () => {
      const adapter = jasmine.createSpyObj('EntitlementAdapter', ['getSignedUrl']);
      adapter.getSignedUrl.and.returnValue(Promise.resolve('https://download.url'));
      
      service.setAdapter(adapter);
      
      const url = await service.getSignedUrl('asset-123', 'download');
      expect(adapter.getSignedUrl).toHaveBeenCalledWith('asset-123', 'download');
    });
  });

  describe('showPaywall', () => {
    it('should show paywall UI if adapter supports it', async () => {
      const gate: PaywallGate = {
        scope: 'chapter',
        refId: 'chapter-1',
        reason: 'Premium content',
      };
      
      const adapter = jasmine.createSpyObj('EntitlementAdapter', ['showPaywallUI', 'resolveEntitlement']);
      adapter.showPaywallUI.and.returnValue(Promise.resolve());
      
      service.setAdapter(adapter);
      
      await service.showPaywall(gate);
      expect(adapter.showPaywallUI).toHaveBeenCalledWith(gate);
    });

    it('should clear cache after paywall interaction', async () => {
      const gate: PaywallGate = {
        scope: 'work',
        reason: 'Test',
      };
      
      const adapter = jasmine.createSpyObj('EntitlementAdapter', ['showPaywallUI', 'resolveEntitlement']);
      adapter.showPaywallUI.and.returnValue(Promise.resolve());
      adapter.resolveEntitlement.and.returnValue(Promise.resolve({
        ok: true,
        entitlements: {},
      }));
      
      service.setAdapter(adapter);
      
      // Cache something
      await service.checkEntitlement({ workId: 'test' });
      
      // Show paywall
      await service.showPaywall(gate);
      
      // Check entitlement again (should not use cache)
      await service.checkEntitlement({ workId: 'test' });
      
      expect(adapter.resolveEntitlement).toHaveBeenCalledTimes(2);
    });

    it('should log warning if adapter does not support paywall UI', async () => {
      const adapter = {} as EntitlementAdapter;
      adapter.resolveEntitlement = jasmine.createSpy().and.returnValue(Promise.resolve({
        ok: true,
        entitlements: {},
      }));
      
      service.setAdapter(adapter);
      
      spyOn(console, 'warn');
      
      await service.showPaywall({ scope: 'work', reason: 'Test' });
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('verifyAge', () => {
    it('should verify age using adapter', async () => {
      const mockAdapter = new MockEntitlementAdapter({ id: 'user', age: 21 });
      service.setAdapter(mockAdapter);
      
      const verified = await service.verifyAge(18);
      expect(verified).toBe(true);
    });

    it('should fail age verification if user is too young', async () => {
      const mockAdapter = new MockEntitlementAdapter({ id: 'user', age: 16 });
      service.setAdapter(mockAdapter);
      
      const verified = await service.verifyAge(18);
      expect(verified).toBe(false);
    });

    it('should use current user age if adapter does not support verification', async () => {
      const adapter = {} as EntitlementAdapter;
      adapter.resolveEntitlement = jasmine.createSpy().and.returnValue(Promise.resolve({
        ok: true,
        entitlements: {},
        user: { id: 'user', age: 25 },
      }));
      
      service.setAdapter(adapter);
      await service.checkEntitlement({ workId: 'test' });
      
      const verified = await service.verifyAge(18);
      expect(verified).toBe(true);
    });

    it('should return false if no age verification available', async () => {
      const adapter = {} as EntitlementAdapter;
      adapter.resolveEntitlement = jasmine.createSpy().and.returnValue(Promise.resolve({
        ok: true,
        entitlements: {},
      }));
      
      service.setAdapter(adapter);
      
      const verified = await service.verifyAge(18);
      expect(verified).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('should check authentication using adapter', () => {
      const mockAdapter = new MockEntitlementAdapter();
      service.setAdapter(mockAdapter);
      
      const isAuth = service.isAuthenticated();
      expect(isAuth).toBe(true);
    });

    it('should fall back to checking current user', async () => {
      const adapter = {} as EntitlementAdapter;
      adapter.resolveEntitlement = jasmine.createSpy().and.returnValue(Promise.resolve({
        ok: true,
        entitlements: {},
        user: { id: 'user' },
      }));
      
      service.setAdapter(adapter);
      await service.checkEntitlement({ workId: 'test' });
      
      const isAuth = service.isAuthenticated();
      expect(isAuth).toBe(true);
    });
  });

  describe('getCurrentUser', () => {
    it('should get current user from adapter', async () => {
      const mockUser: UserInfo = {
        id: 'user-1',
        displayName: 'Test User',
      };
      
      const mockAdapter = new MockEntitlementAdapter(mockUser);
      service.setAdapter(mockAdapter);
      
      const user = await service.getCurrentUser();
      expect(user).toEqual(mockUser);
    });

    it('should return cached user if adapter does not support getCurrentUser', async () => {
      const mockUser: UserInfo = { id: 'user' };
      
      const adapter = {} as EntitlementAdapter;
      adapter.resolveEntitlement = jasmine.createSpy().and.returnValue(Promise.resolve({
        ok: true,
        entitlements: {},
        user: mockUser,
      }));
      
      service.setAdapter(adapter);
      await service.checkEntitlement({ workId: 'test' });
      
      const user = await service.getCurrentUser();
      expect(user).toEqual(mockUser);
    });
  });

  describe('getCurrentUser$ Observable', () => {
    it('should emit current user updates', (done) => {
      const mockUser: UserInfo = { id: 'user', displayName: 'Test' };
      const mockAdapter = new MockEntitlementAdapter(mockUser);
      
      service.getCurrentUser$().subscribe(user => {
        if (user) {
          expect(user).toEqual(mockUser);
          done();
        }
      });
      
      service.setAdapter(mockAdapter);
    });
  });

  describe('clearCache', () => {
    it('should clear entitlement cache', async () => {
      const adapter = jasmine.createSpyObj('EntitlementAdapter', ['resolveEntitlement']);
      adapter.resolveEntitlement.and.returnValue(Promise.resolve({
        ok: true,
        entitlements: {},
      }));
      
      service.setAdapter(adapter);
      
      // First call
      await service.checkEntitlement({ workId: 'test' });
      
      // Clear cache
      service.clearCache();
      
      // Second call (should not use cache)
      await service.checkEntitlement({ workId: 'test' });
      
      expect(adapter.resolveEntitlement).toHaveBeenCalledTimes(2);
    });
  });
});
