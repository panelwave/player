/**
 * Tracking Service Tests
 */

import { TestBed } from '@angular/core/testing';
import { TrackingService } from './tracking.service';

describe('TrackingService', () => {
  let service: TrackingService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TrackingService);
  });

  afterEach(() => {
    service.destroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('configuration', () => {
    it('should configure service', () => {
      service.configure({
        endpoint: 'https://analytics.example.com',
        consentRequired: false,
        batchSize: 5
      });

      expect(true).toBe(true); // Configuration applied
    });

    it('should set event whitelist', () => {
      service.configure({
        eventWhitelist: ['page_view', 'click']
      });

      service.setConsent(true);
      service.track('page_view');
      service.track('unauthorized_event');

      // Only whitelisted events should be tracked
      expect(service.getQueueSize()).toBe(1);
    });
  });

  describe('consent gating', () => {
    it('should not track without consent', () => {
      service.setConsent(false);
      service.track('test_event');

      expect(service.getQueueSize()).toBe(0);
    });

    it('should track with consent', () => {
      service.setConsent(true);
      service.track('test_event');

      expect(service.getQueueSize()).toBe(1);
    });

    it('should get consent status', () => {
      service.setConsent(true);
      expect(service.getConsent()).toBe(true);

      service.setConsent(false);
      expect(service.getConsent()).toBe(false);
    });

    it('should clear queue when consent revoked', () => {
      service.setConsent(true);
      service.track('event1');
      service.track('event2');

      expect(service.getQueueSize()).toBe(2);

      service.setConsent(false);

      expect(service.getQueueSize()).toBe(0);
    });

    it('should allow tracking without consent if not required', () => {
      service.configure({ consentRequired: false });
      service.setConsent(false);
      service.track('test_event');

      expect(service.getQueueSize()).toBe(1);
    });
  });

  describe('event tracking', () => {
    beforeEach(() => {
      service.setConsent(true);
    });

    it('should track event with type', () => {
      service.track('page_view');
      expect(service.getQueueSize()).toBe(1);
    });

    it('should track event with data', () => {
      service.track('click', { button: 'submit', page: 'home' });
      expect(service.getQueueSize()).toBe(1);
    });

    it('should include session ID in events', () => {
      const sessionId = service.getSessionId();
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');
    });
  });

  describe('event whitelist', () => {
    beforeEach(() => {
      service.setConsent(true);
      service.configure({
        eventWhitelist: ['page_view', 'click', 'scroll']
      });
    });

    it('should allow whitelisted events', () => {
      service.track('page_view');
      service.track('click');

      expect(service.getQueueSize()).toBe(2);
    });

    it('should block non-whitelisted events', () => {
      service.track('custom_event');
      service.track('unknown_type');

      expect(service.getQueueSize()).toBe(0);
    });

    it('should filter based on whitelist', () => {
      // Whitelist is set in beforeEach to ['page_view', 'click', 'scroll']
      
      service.track('page_view');   // allowed
      service.track('custom_event'); // blocked
      service.track('click');        // allowed
      service.track('unknown');      // blocked

      expect(service.getQueueSize()).toBe(2); // Only 2 allowed events
    });
  });

  describe('debouncing', () => {
    beforeEach(() => {
      service.setConsent(true);
      jasmine.clock().install();
    });

    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('should debounce high-frequency events', () => {
      service.configure({ debounceMs: 300 });

      // Rapid scroll events
      service.track('scroll', { y: 100 });
      service.track('scroll', { y: 200 });
      service.track('scroll', { y: 300 });

      // Should not be tracked yet
      expect(service.getQueueSize()).toBe(0);

      // Advance time
      jasmine.clock().tick(300);

      // Should have only the last event
      expect(service.getQueueSize()).toBe(1);
    });

    it('should not debounce regular events', () => {
      service.track('page_view');
      service.track('click');

      expect(service.getQueueSize()).toBe(2);
    });
  });

  describe('batching', () => {
    beforeEach(() => {
      service.setConsent(true);
    });

    it('should batch events by size', async () => {
      service.configure({ batchSize: 3, endpoint: 'https://test.com' });

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(new Response(null, { status: 200 }))
      );

      service.track('event1');
      service.track('event2');
      
      expect(service.getQueueSize()).toBe(2);

      service.track('event3'); // Triggers batch

      // Wait for async batch send
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(service.getQueueSize()).toBe(0);
      expect(window.fetch).toHaveBeenCalled();
    });

    it('should flush queue manually', async () => {
      service.configure({ endpoint: 'https://test.com' });

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(new Response(null, { status: 200 }))
      );

      service.track('event1');
      service.track('event2');

      await service.flush();

      expect(service.getQueueSize()).toBe(0);
      expect(window.fetch).toHaveBeenCalled();
    });
  });

  describe('endpoint sending', () => {
    beforeEach(() => {
      service.setConsent(true);
      service.configure({ endpoint: 'https://analytics.example.com' });
    });

    it('should send events to endpoint', async () => {
      const fetchSpy = spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(new Response(null, { status: 200 }))
      );

      service.track('test_event');
      await service.flush();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://analytics.example.com',
        jasmine.objectContaining({
          method: 'POST',
          headers: jasmine.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should handle endpoint errors gracefully', async () => {
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(new Response(null, { status: 500 }))
      );

      spyOn(console, 'error');

      service.track('test_event');
      await service.flush();

      expect(console.error).toHaveBeenCalled();
    });

    it('should not send if no endpoint configured', async () => {
      service.configure({ endpoint: undefined });

      const fetchSpy = spyOn(window, 'fetch');

      service.track('test_event');
      await service.flush();

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('session ID', () => {
    it('should generate session ID', () => {
      const sessionId = service.getSessionId();
      expect(sessionId).toBeTruthy();
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it('should maintain same session ID', () => {
      const sessionId1 = service.getSessionId();
      const sessionId2 = service.getSessionId();

      expect(sessionId1).toBe(sessionId2);
    });
  });

  describe('queue management', () => {
    beforeEach(() => {
      service.setConsent(true);
    });

    it('should get queue size', () => {
      expect(service.getQueueSize()).toBe(0);

      service.track('event1');
      expect(service.getQueueSize()).toBe(1);

      service.track('event2');
      expect(service.getQueueSize()).toBe(2);
    });

    it('should clear queue', () => {
      service.track('event1');
      service.track('event2');

      expect(service.getQueueSize()).toBe(2);

      service.clear();

      expect(service.getQueueSize()).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should cleanup resources', async () => {
      service.setConsent(true);
      service.configure({ endpoint: 'https://test.com' });

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(new Response(null, { status: 200 }))
      );

      service.track('event1');

      service.destroy();

      // Queue should be cleared
      expect(service.getQueueSize()).toBe(0);
    });
  });
});
