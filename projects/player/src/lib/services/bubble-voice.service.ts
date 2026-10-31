/**
 * Bubble Voice Service
 *
 * Speaks the lines of speech balloons (`SpeechBubble.audioAssetId`, format
 * 1.12): a line plays on the `voiceover` bus when its balloon appears —
 * at `showAtMs` on the panel's clock, the one timed balloons wait on — and
 * the lines of a panel queue in balloon order, one after another. Several
 * panels shown together (page view, canvas view) read in the order they
 * were shown; a panel that is scrolled away or left stops talking, and
 * entering it again reads it from the top.
 *
 * The clock is the `BubbleClockDirective` on each panel host: it attaches
 * the panel's lines here while the panel is shown and detaches them when
 * the panel changes or is destroyed. The reader's locale picks the variant
 * (an audio asset lists one `AudioVariant` per `locale`; see
 * `ManifestService.getAsset`), so switching the language re-reads the
 * current panel in the new one.
 *
 * The reader's Voices toggle (`setEnabled`) stops and starts everything;
 * the shell also mutes the `voiceover` bus with it. Browser autoplay
 * policy: a line refused before the first user gesture is retried on
 * that gesture, like panel audio.
 */

import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { AudioEngineService } from './audio-engine.service';
import { ManifestService } from './manifest.service';
import { PlayerStateService } from './player-state.service';
import { UserGestureService } from './user-gesture.service';
import { BubbleClock } from '../utils/bubble-clock';
import { resolveAudioAsset } from '../utils/audio-asset-utils';
import { voiceCuesFor, type VoiceCue } from '../utils/bubble-voice-utils';
import type { Panel, SpeechBubble } from '../types';

/** Fade applied when a line is cut short (panel left, voices turned off, language switched). */
export const BUBBLE_VOICE_STOP_FADE_MS = 150;

/** One shown panel with spoken lines. */
interface VoiceSession {
  key: string;
  cues: VoiceCue[];
  clock: BubbleClock;
  /** Lines already spoken (or started) since the panel was shown. */
  spoken: Set<string>;
  subscription: Subscription;
  /** Timer for the next line that is not due yet. */
  timer: ReturnType<typeof setTimeout> | null;
}

/** The line being spoken right now. */
interface Speaking {
  session: VoiceSession;
  cue: VoiceCue;
  trackId: string;
}

@Injectable({
  providedIn: 'root',
})
export class BubbleVoiceService implements OnDestroy {
  private readonly engine = inject(AudioEngineService);
  private readonly manifestService = inject(ManifestService);
  private readonly playerState = inject(PlayerStateService);
  private readonly gesture = inject(UserGestureService);

  /** Attached panels, in the order they were shown. */
  private sessions: VoiceSession[] = [];

  private speaking: Speaking | null = null;

  /** A line the autoplay policy refused before the first gesture; retried on it. */
  private blocked: { session: VoiceSession; cue: VoiceCue } | null = null;

  private enabled = true;

  private locale: string | undefined;

  /** Pending coalesced `tick` (see scheduleTick). */
  private tickTimer: ReturnType<typeof setTimeout> | null = null;

  /** Assets already warned about (missing / not audio), to keep the console quiet. */
  private readonly warned = new Set<string>();

  private readonly speakingSubject = new BehaviorSubject<string | null>(null);

  /** The id of the balloon being spoken, `null` while silent. */
  readonly speaking$: Observable<string | null> = this.speakingSubject.asObservable();

  private readonly subscriptions = new Subscription();

  constructor() {
    this.locale = this.playerState.getLocale();
    this.subscriptions.add(
      this.playerState.locale$.subscribe((locale) => {
        if (locale === this.locale) {
          return;
        }
        this.locale = locale;
        // Re-read the current panel in the new language.
        this.stopSpeaking(BUBBLE_VOICE_STOP_FADE_MS);
        this.restartShownSessions();
      })
    );
    this.subscriptions.add(
      this.gesture.userHasInteracted$.subscribe((interacted) => {
        if (interacted) {
          this.onUserGesture();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.stopAll();
  }

  /**
   * Speak the lines of `panel` while `clock` runs. Returns the detach
   * function; the `BubbleClockDirective` calls it when the panel changes
   * or the host is destroyed.
   */
  attach(key: string, panel: Pick<Panel, 'speechBubbles'>, clock: BubbleClock): () => void {
    const cues = voiceCuesFor(panel);
    if (cues.length === 0) {
      return () => undefined;
    }
    const session: VoiceSession = {
      key,
      cues,
      clock,
      spoken: new Set<string>(),
      timer: null,
      subscription: new Subscription(),
    };
    session.subscription = clock.changes$.subscribe((state) => this.onClockChange(session, state));
    this.sessions.push(session);
    if (clock.state === 'running') {
      this.scheduleTick();
    }
    return () => this.detach(session);
  }

  /** The reader's Voices toggle. Off stops the current line; on reads the shown panels from the top. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.blocked = null;
      this.stopSpeaking(BUBBLE_VOICE_STOP_FADE_MS);
      for (const session of this.sessions) {
        this.clearTimer(session);
      }
      return;
    }
    this.restartShownSessions();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Speak one balloon's line again (a tap on the balloon). No-op while voices are off. */
  replay(bubble: Pick<SpeechBubble, 'id'>): void {
    if (!this.enabled) {
      return;
    }
    for (const session of this.sessions) {
      const cue = session.cues.find((candidate) => candidate.bubbleId === bubble.id);
      if (cue) {
        this.stopSpeaking(0);
        this.speak(session, cue);
        return;
      }
    }
  }

  /** Stop everything and forget every panel (shell teardown). */
  stopAll(): void {
    this.blocked = null;
    if (this.tickTimer !== null) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    this.stopSpeaking(0);
    for (const session of this.sessions) {
      this.clearTimer(session);
      session.subscription.unsubscribe();
    }
    this.sessions = [];
  }

  // ---------------------------------------------------------------------------

  private detach(session: VoiceSession): void {
    this.clearTimer(session);
    session.subscription.unsubscribe();
    this.sessions = this.sessions.filter((candidate) => candidate !== session);
    if (this.blocked?.session === session) {
      this.blocked = null;
    }
    if (this.speaking?.session === session) {
      this.stopSpeaking(BUBBLE_VOICE_STOP_FADE_MS);
    }
    this.tick();
  }

  private onClockChange(session: VoiceSession, state: BubbleClock['state']): void {
    if (state === 'running') {
      this.scheduleTick();
      return;
    }
    // Paused (scrolled away, tab hidden, video paused), reset or done: the
    // panel stops talking; a line cut short is spoken again when the panel
    // is shown again.
    this.clearTimer(session);
    if (state === 'waiting') {
      session.spoken.clear();
    }
    if (this.speaking?.session === session) {
      session.spoken.delete(this.speaking.cue.bubbleId);
      this.stopSpeaking(BUBBLE_VOICE_STOP_FADE_MS);
    }
    if (this.blocked?.session === session) {
      this.blocked = null;
    }
    this.tick();
  }

  /**
   * Run `tick` after the current task. Panels that are shown in the same
   * frame (a page's panels scrolling into view) are all running by then, so
   * they read in the order they were attached — reading order — and not in
   * the order their observers happened to fire.
   */
  private scheduleTick(): void {
    if (this.tickTimer !== null) {
      return;
    }
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      this.tick();
    }, 0);
  }

  /**
   * Speak the next due line, if nothing is being spoken: the first unspoken
   * line whose time has come, across the shown panels in the order they
   * were shown. Otherwise wait for the earliest line not due yet.
   */
  private tick(): void {
    if (!this.enabled || this.speaking || this.blocked) {
      return;
    }
    let next: { session: VoiceSession; cue: VoiceCue; wait: number } | null = null;
    for (const session of this.sessions) {
      this.clearTimer(session);
      if (session.clock.state !== 'running') {
        continue;
      }
      const elapsed = session.clock.elapsed();
      for (const cue of session.cues) {
        if (session.spoken.has(cue.bubbleId)) {
          continue;
        }
        if (cue.showAtMs <= elapsed) {
          this.speak(session, cue);
          return;
        }
        const wait = cue.showAtMs - elapsed;
        if (!next || wait < next.wait) {
          next = { session, cue, wait };
        }
        break; // later lines of this panel come after this one
      }
    }
    if (next) {
      const { session, wait } = next;
      session.timer = setTimeout(() => {
        session.timer = null;
        this.tick();
      }, Math.max(0, wait));
    }
  }

  private speak(session: VoiceSession, cue: VoiceCue): void {
    session.spoken.add(cue.bubbleId);
    const url = this.resolveUrl(cue.assetId);
    if (!url) {
      this.tick();
      return;
    }
    const trackId = `voice:${session.key}:${cue.bubbleId}`;
    const current: Speaking = { session, cue, trackId };
    this.speaking = current;
    this.speakingSubject.next(cue.bubbleId);
    this.engine
      .play({
        id: trackId,
        url,
        role: 'voiceover',
        loop: false,
        volume: 1,
        onEnded: () => {
          if (this.speaking === current) {
            this.speaking = null;
            this.speakingSubject.next(null);
            this.tick();
          }
        },
      })
      .catch((error: unknown) => {
        if (this.speaking !== current) {
          return;
        }
        this.speaking = null;
        this.speakingSubject.next(null);
        if (this.isAutoplayRefusal(error) && !this.gesture.hasInteracted()) {
          // Spoken on the first gesture instead.
          session.spoken.delete(cue.bubbleId);
          this.blocked = { session, cue };
          return;
        }
        this.tick();
      });
  }

  private stopSpeaking(fadeMs: number): void {
    const current = this.speaking;
    if (!current) {
      return;
    }
    this.speaking = null;
    this.speakingSubject.next(null);
    if (this.engine.isActive(current.trackId)) {
      void this.engine.stop(current.trackId, fadeMs);
    }
  }

  /** Read every shown panel from the top (voices turned on, language switched). */
  private restartShownSessions(): void {
    this.blocked = null;
    for (const session of this.sessions) {
      if (session.clock.state === 'running') {
        session.spoken.clear();
      }
    }
    this.tick();
  }

  /** First user gesture: resume the context and speak the refused line. */
  private onUserGesture(): void {
    void this.engine.resumeContext().catch(() => undefined);
    const blocked = this.blocked;
    this.blocked = null;
    if (blocked && this.enabled && !this.speaking && this.sessions.includes(blocked.session)) {
      this.speak(blocked.session, blocked.cue);
      return;
    }
    this.tick();
  }

  private clearTimer(session: VoiceSession): void {
    if (session.timer !== null) {
      clearTimeout(session.timer);
      session.timer = null;
    }
  }

  private resolveUrl(assetId: string): string | null {
    const asset = this.manifestService.getAsset(assetId, this.locale);
    const resolved = resolveAudioAsset(asset, this.manifestService.getManifest()?.assets?.base);
    if ('error' in resolved) {
      if (!this.warned.has(assetId)) {
        this.warned.add(assetId);
        console.warn(`[BubbleVoiceService] Spoken line "${assetId}" ${resolved.error}.`);
      }
      return null;
    }
    return resolved.url;
  }

  private isAutoplayRefusal(error: unknown): boolean {
    const name = (error as { name?: string } | null)?.name;
    return name === 'NotAllowedError' || name === 'AbortError';
  }
}
