import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_THEME_COLORS,
  ThemeService,
  contrastRatio,
  mixHex,
  readableOn,
  resolveTheme,
  themeCssVariables,
} from './theme.service';

describe('theme', () => {
  describe('resolveTheme', () => {
    it('defaults to the dark palette', () => {
      const t = resolveTheme(null);
      expect(t.mode).toBe('dark');
      expect(t.colors).toEqual(DEFAULT_THEME_COLORS.dark);
      expect(t.shape).toEqual({ radius: 12, borderWidth: 1, shadow: 'soft' });
      expect(t.density).toBe('regular');
    });

    it('follows prefers-color-scheme in auto mode', () => {
      expect(resolveTheme({ theme: { mode: 'auto' } }, false).mode).toBe('light');
      expect(resolveTheme({ theme: { mode: 'auto' } }, true).mode).toBe('dark');
      expect(resolveTheme({ theme: { mode: 'light' } }, true).colors.surface).toBe(DEFAULT_THEME_COLORS.light.surface);
    });

    it('derives accent and surface from branding with readable text', () => {
      const t = resolveTheme({ branding: { accentColor: '#ffeb3b', primaryColor: '#ffffff' } });
      expect(t.colors.accent).toBe('#ffeb3b');
      expect(t.colors.onAccent).toBe('#111827');
      expect(t.colors.progress).toBe('#ffeb3b');
      expect(t.colors.waveformProgress).toBe('#ffeb3b');
      expect(t.colors.surface).toBe('#ffffff');
      expect(t.colors.onSurface).toBe('#111827');
    });

    it('lets theme colours win over branding and keeps explicit derived keys', () => {
      const t = resolveTheme({
        branding: { accentColor: '#ff0000' },
        theme: { colors: { accent: '#00ff00', onAccent: '#123456', progress: '#abcdef' } },
      });
      expect(t.colors.accent).toBe('#00ff00');
      expect(t.colors.onAccent).toBe('#123456');
      expect(t.colors.progress).toBe('#abcdef');
    });

    it('applies the host override last', () => {
      const t = resolveTheme({ theme: { mode: 'dark', colors: { accent: '#00ff00' } } }, true, {
        mode: 'light',
        colors: { accent: '#0000ff' },
      });
      expect(t.mode).toBe('light');
      expect(t.colors.accent).toBe('#0000ff');
    });

    it('ignores invalid values', () => {
      const t = resolveTheme({
        theme: {
          colors: { accent: 'red', surface: 'url(x)' as string, unknown: '#fff' } as Record<string, string>,
          fonts: { ui: { family: 'x;}body{color:red' } },
          shape: { radius: 99, borderWidth: -2 },
        },
      });
      expect(t.colors.accent).toBe(DEFAULT_THEME_COLORS.dark.accent);
      expect(t.colors.surface).toBe(DEFAULT_THEME_COLORS.dark.surface);
      expect((t.colors as Record<string, string>)['unknown']).toBeUndefined();
      expect(t.fonts.ui).not.toContain('body');
      expect(t.shape.radius).toBe(32);
      expect(t.shape.borderWidth).toBe(1);
    });

    it('builds font stacks with quoted multi-word families', () => {
      const t = resolveTheme({ theme: { fonts: { body: { family: 'Source Serif 4', fallback: 'Georgia, serif' } } } });
      expect(t.fonts.body).toBe('"Source Serif 4", Georgia, serif');
    });

    it('accepts an alpha backdrop', () => {
      expect(resolveTheme({ theme: { colors: { backdrop: '#0f172acc' } } }).colors.backdrop).toBe('#0f172acc');
    });
  });

  it('themeCssVariables emits kebab-case custom properties', () => {
    const vars = themeCssVariables(resolveTheme({ theme: { shape: { radius: 4, shadow: 'none' }, density: 'compact' } }));
    expect(vars['--pw-theme-on-surface-muted']).toBe(DEFAULT_THEME_COLORS.dark.onSurfaceMuted);
    expect(vars['--pw-theme-waveform-progress']).toBe(DEFAULT_THEME_COLORS.dark.waveformProgress);
    expect(vars['--pw-theme-radius']).toBe('4px');
    expect(vars['--pw-theme-shadow']).toBe('none');
    expect(vars['--pw-theme-density']).toBe('0.85');
  });

  it('colour helpers', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(readableOn('#000000')).toBe('#ffffff');
    expect(readableOn('#fff')).toBe('#111827');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  describe('ThemeService', () => {
    let service: ThemeService;
    let host: HTMLElement;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [ThemeService] });
      service = TestBed.inject(ThemeService);
      host = document.createElement('div');
      document.body.appendChild(host);
    });

    afterEach(() => {
      service.ngOnDestroy();
      host.remove();
    });

    it('scopes the variables to the host with a zero-specificity rule', () => {
      service.attach(host);
      service.setUi({ theme: { colors: { accent: '#e11d48' } } });
      const scope = host.getAttribute('data-pw-theme');
      expect(scope).toBeTruthy();
      expect(host.getAttribute('data-pw-theme-mode')).toBe('dark');
      expect(getComputedStyle(host).getPropertyValue('--pw-theme-accent').trim()).toBe('#e11d48');
      const style = document.head.querySelector(`style[data-pw-theme-style="${scope}"]`);
      expect(style?.textContent).toContain(`:where([data-pw-theme="${scope}"])`);
    });

    it('lets a host rule override a variable', () => {
      service.attach(host);
      service.setUi({ theme: { colors: { accent: '#e11d48' } } });
      host.style.setProperty('--pw-theme-accent', '#00ff00');
      expect(getComputedStyle(host).getPropertyValue('--pw-theme-accent').trim()).toBe('#00ff00');
    });

    it('re-emits on override changes and removes its style on destroy', () => {
      const seen: string[] = [];
      service.theme$.subscribe((t) => seen.push(t.colors.accent));
      service.attach(host);
      service.setOverride({ colors: { accent: '#111111' } });
      expect(seen[seen.length - 1]).toBe('#111111');
      const scope = host.getAttribute('data-pw-theme');
      service.ngOnDestroy();
      expect(document.head.querySelector(`style[data-pw-theme-style="${scope}"]`)).toBeNull();
    });
  });
});
