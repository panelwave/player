import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { PaywallOverlayComponent, type PaywallAction } from './paywall-overlay.component';
import type { PaywallGate, PurchaseInfo } from '../../../types/entitlement.types';

describe('PaywallOverlayComponent', () => {
  let fixture: ComponentFixture<PaywallOverlayComponent>;
  let component: PaywallOverlayComponent;
  let actions: PaywallAction[];
  let purchases: string[];
  let closed: number;

  const q = <T extends HTMLElement>(sel: string): T | null =>
    fixture.nativeElement.querySelector(sel) as T | null;
  const qa = (sel: string): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll(sel) as NodeListOf<HTMLElement>);
  const text = (sel: string): string | undefined => q(sel)?.textContent?.replace(/\s+/g, ' ').trim();

  const options: PurchaseInfo[] = [
    {
      productId: 'ch1',
      name: 'Chapter 1',
      price: { amount: 2.99, currency: 'USD' },
      type: 'one-time',
      description: 'Own it forever',
    },
    { productId: 'sub', name: 'Monthly', price: { amount: 4.99, currency: 'EUR' }, type: 'subscription' },
    { productId: 'tok', name: 'Token', price: { amount: 1, currency: 'USD' }, type: 'token' },
  ];

  function set(inputs: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(inputs)) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PaywallOverlayComponent] }).compileComponents();
    fixture = TestBed.createComponent(PaywallOverlayComponent);
    component = fixture.componentInstance;
    actions = [];
    purchases = [];
    closed = 0;
    component.action.subscribe((a) => actions.push(a));
    component.purchase.subscribe((p) => purchases.push(p));
    component.close.subscribe(() => closed++);
    set({ visible: true });
  });

  describe('title and message', () => {
    it('toggles the visible class', () => {
      expect(q('.paywall-overlay')?.classList).toContain('visible');
      set({ visible: false });
      expect(q('.paywall-overlay')?.classList).not.toContain('visible');
    });

    it('derives the title from the gate scope', () => {
      expect(text('.paywall-title')).toBe('Premium Content');
      const scopes: [PaywallGate['scope'], string][] = [
        ['work', 'Unlock This Comic'],
        ['chapter', 'Unlock This Chapter'],
        ['panel', 'Unlock Premium Content'],
      ];
      for (const [scope, title] of scopes) {
        set({ gate: { scope, reason: '' } });
        expect(text('.paywall-title')).toBe(title);
        expect(q('[role="dialog"]')?.getAttribute('aria-label')).toBe(title);
      }
    });

    it('prefers a custom localized title for the current locale', () => {
      set({ gate: { scope: 'work', reason: '' }, title: { 'en-US': 'Buy', 'de-DE': 'Kaufen' }, locale: 'de-DE' });
      expect(text('.paywall-title')).toBe('Kaufen');
    });

    it('falls back to en-US, then the first value, for custom strings', () => {
      set({ title: { 'en-US': 'Buy', 'fr-FR': 'Acheter' }, locale: 'es-ES' });
      expect(text('.paywall-title')).toBe('Buy');
      set({ title: { 'fr-FR': 'Acheter' } });
      expect(text('.paywall-title')).toBe('Acheter');
      set({ title: 'Plain title' });
      expect(text('.paywall-title')).toBe('Plain title');
      set({ title: {} });
      expect(component.getTitle()).toBe('');
    });

    it('uses custom message, then gate reason, then the default message', () => {
      expect(text('.paywall-message')).toBe('This content requires a subscription or purchase to access.');
      set({ gate: { scope: 'chapter', reason: 'Members only' } });
      expect(text('.paywall-message')).toBe('Members only');
      set({ message: { 'en-US': 'Custom message' } });
      expect(text('.paywall-message')).toBe('Custom message');
    });
  });

  describe('preview info', () => {
    const gate: PaywallGate = { scope: 'chapter', reason: 'x', preview: { previewPanels: 3, mode: 'blur' } };

    it('is hidden unless preview is allowed', () => {
      set({ gate });
      expect(q('.preview-info')).toBeNull();
    });

    it('shows preview panel count and mode when allowed', () => {
      set({ gate, allowPreview: true });
      expect(text('.preview-text')).toContain('Preview 3 panels free');
      expect(text('.preview-mode')).toBe('Preview mode: blur');
    });

    it('omits missing preview fields', () => {
      set({ gate: { scope: 'chapter', reason: 'x', preview: {} }, allowPreview: true });
      expect(q('.preview-info')).not.toBeNull();
      expect(q('.preview-text')).toBeNull();
      expect(q('.preview-mode')).toBeNull();
    });
  });

  describe('purchase options', () => {
    beforeEach(() => set({ purchaseOptions: options }));

    it('renders each option with name, formatted price, description and type label', () => {
      const btns = qa('.purchase-option');
      expect(btns.length).toBe(3);
      expect(btns[0].querySelector('.option-name')?.textContent).toBe('Chapter 1');
      expect(btns[0].querySelector('.option-price')?.textContent).toBe('$2.99');
      expect(btns[0].querySelector('.option-description')?.textContent).toBe('Own it forever');
      expect(btns[0].querySelector('.option-type')?.textContent).toBe('Buy Once');
      expect(btns[1].querySelector('.option-description')).toBeNull();
      expect(btns[1].querySelector('.option-price')?.textContent).toContain('4.99');
      expect(btns[1].querySelector('.option-type')?.textContent).toBe('Subscribe');
      expect(btns[2].querySelector('.option-type')?.textContent).toBe('Use Token');
      expect(component.getPurchaseTypeLabel('other')).toBe('Purchase');
    });

    it('formats prices for the current locale', () => {
      set({ locale: 'de-DE' });
      expect(component.formatPrice(4.99, 'EUR')).toMatch(/4,99\s€/);
    });

    it('emits purchase with the product id and a purchase action', () => {
      qa('.purchase-option')[0].click();
      expect(purchases).toEqual(['ch1']);
      expect(actions).toEqual(['purchase']);
      expect(closed).toBe(0);
    });

    it('emits a subscribe action for a subscription option', () => {
      qa('.purchase-option')[1].click();
      expect(purchases).toEqual(['sub']);
      expect(actions).toEqual(['subscribe']);
    });

    it('renders an option without name or price by its type label', () => {
      set({ purchaseOptions: [{ productId: 'x', name: '', type: 'subscription' }] });
      const btn = qa('.purchase-option')[0];
      expect(btn.querySelector('.option-name')?.textContent).toBe('Subscribe');
      expect(btn.querySelector('.option-price')).toBeNull();
      expect(btn.querySelector('.option-type')).toBeNull();
    });

    it('keeps sign-in next to the options and shows "Maybe Later"', () => {
      expect(q('.login-btn')).not.toBeNull();
      expect(text('.action-btn.secondary')).toBe('Maybe Later');
      expect(q('.action-btn.primary')).toBeNull();
    });
  });

  describe('no purchase options', () => {
    it('offers sign-in and emits login', () => {
      q<HTMLButtonElement>('.login-btn')?.click();
      expect(actions).toEqual(['login']);
      expect(text('.action-btn.secondary')).toBe('Maybe Later');
      expect(q('.purchase-options')).toBeNull();
    });

    it('shows only "Go Back" when login is disabled', () => {
      set({ showLogin: false });
      expect(q('.login-btn')).toBeNull();
      expect(q('.action-btn.secondary')).toBeNull();
      q<HTMLButtonElement>('.action-btn.primary')?.click();
      expect(actions).toEqual(['dismiss']);
      expect(closed).toBe(1);
    });
  });

  describe('dismissal', () => {
    it('close button and "Maybe Later" emit dismiss + close', () => {
      q<HTMLButtonElement>('.close-btn')?.click();
      q<HTMLButtonElement>('.action-btn.secondary')?.click();
      expect(actions).toEqual(['dismiss', 'dismiss']);
      expect(closed).toBe(2);
    });

    it('closes on backdrop click but not on clicks inside the modal', () => {
      q<HTMLElement>('.paywall-modal')?.click();
      expect(closed).toBe(0);
      q<HTMLElement>('.paywall-overlay')?.click();
      expect(closed).toBe(1);
    });

    it('Escape on the overlay dismisses and stops propagation', () => {
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      const stop = spyOn(ev, 'stopPropagation').and.callThrough();
      q<HTMLElement>('.paywall-overlay')?.dispatchEvent(ev);
      expect(stop).toHaveBeenCalled();
      expect(closed).toBe(1);
    });

    it('document Escape dismisses only while visible', () => {
      set({ visible: false });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(0);
      set({ visible: true });
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(1);
      expect(actions).toEqual(['dismiss']);
    });
  });

  describe('built-in text without ngx-translate', () => {
    it('falls back to English for every built-in string (no raw keys)', () => {
      set({ purchaseOptions: [], showLogin: true, gate: { scope: 'work', preview: { previewPanels: 2, mode: 'blur' } }, allowPreview: true });
      expect(q('.close-btn')?.getAttribute('aria-label')).toBe('Close');
      expect(text('.paywall-title')).toBe('Unlock This Comic');
      expect(text('.preview-text')).toBe('Preview 2 panels free');
      expect(text('.login-btn')).toBe('Sign In to Continue');
      expect(text('.footer-text')).toBe('Secure payment processing');
      expect(fixture.nativeElement.textContent).not.toContain('paywall.');
    });
  });
});

describe('PaywallOverlayComponent (localized)', () => {
  let fixture: ComponentFixture<PaywallOverlayComponent>;
  const text = (sel: string): string | undefined =>
    (fixture.nativeElement.querySelector(sel) as HTMLElement | null)?.textContent?.replace(/\s+/g, ' ').trim();

  function set(inputs: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(inputs)) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaywallOverlayComponent], providers: [provideTranslateService()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('de', {
      paywall: {
        title_work: 'Diesen Comic freischalten',
        title_default: 'Premium-Inhalt',
        message_default: 'Für diesen Inhalt ist ein Abo oder ein Kauf erforderlich.',
        close: 'Schließen',
        preview_panels: '{{count}} Panels kostenlos ansehen',
        preview_mode: 'Vorschaumodus: {{mode}}',
        choose_option: 'Option auswählen:',
        type_one_time: 'Einmalig kaufen',
        type_subscription: 'Abonnieren',
        type_token: 'Token einlösen',
        type_default: 'Kaufen',
        sign_in: 'Anmelden, um fortzufahren',
        go_back: 'Zurück',
        maybe_later: 'Vielleicht später',
        secure_payment: 'Sichere Zahlungsabwicklung',
      },
    });
    translate.use('de');
    fixture = TestBed.createComponent(PaywallOverlayComponent);
    set({ visible: true, locale: 'de-DE' });
  });

  it('translates the built-in UI text', () => {
    expect(text('.paywall-title')).toBe('Premium-Inhalt');
    expect(text('.paywall-message')).toBe('Für diesen Inhalt ist ein Abo oder ein Kauf erforderlich.');
    expect(text('.login-btn')).toBe('Anmelden, um fortzufahren');
    expect(text('.action-btn.secondary')).toBe('Vielleicht später');
    expect(text('.footer-text')).toBe('Sichere Zahlungsabwicklung');
    expect((fixture.nativeElement.querySelector('.close-btn') as HTMLElement).getAttribute('aria-label')).toBe('Schließen');

    set({ gate: { scope: 'work', preview: { previewPanels: 3, mode: 'blur' } }, allowPreview: true });
    expect(text('.paywall-title')).toBe('Diesen Comic freischalten');
    expect(text('.preview-text')).toBe('3 Panels kostenlos ansehen');
    expect(text('.preview-mode')).toBe('Vorschaumodus: blur');

    set({ showLogin: false });
    expect(text('.action-btn.primary')).toBe('Zurück');

    set({
      purchaseOptions: [
        { productId: 'a', name: 'A', price: { amount: 1, currency: 'EUR' }, type: 'one-time' },
        { productId: 'b', name: 'B', price: { amount: 1, currency: 'EUR' }, type: 'subscription' },
        { productId: 'c', name: 'C', price: { amount: 1, currency: 'EUR' }, type: 'token' },
      ],
    });
    expect(text('.options-title')).toBe('Option auswählen:');
    const types = Array.from(fixture.nativeElement.querySelectorAll('.option-type') as NodeListOf<HTMLElement>).map((e) => e.textContent);
    expect(types).toEqual(['Einmalig kaufen', 'Abonnieren', 'Token einlösen']);
    expect(fixture.componentInstance.getPurchaseTypeLabel('other')).toBe('Kaufen');
  });

  it('translates the gate lock reason instead of the English sentence', () => {
    TestBed.inject(TranslateService).setTranslation('de', { paywall: { reason_purchase_required: 'Dieser Teil ist käuflich.' } }, true);
    set({ gate: { scope: 'panel', reason: 'This part of the story is available to buy.', lockReason: 'purchase_required' } });
    expect(text('.paywall-message')).toBe('Dieser Teil ist käuflich.');

    // An unknown reason code keeps the gate's own sentence.
    set({ gate: { scope: 'panel', reason: 'Host text', lockReason: 'custom' } });
    expect(text('.paywall-message')).toBe('Host text');
  });

  it('keeps manifest-provided localized title/message untouched', () => {
    set({ title: { 'en-US': 'Members only', 'de-DE': 'Nur für Mitglieder' }, message: 'Custom' });
    expect(text('.paywall-title')).toBe('Nur für Mitglieder');
    expect(text('.paywall-message')).toBe('Custom');
  });
});
