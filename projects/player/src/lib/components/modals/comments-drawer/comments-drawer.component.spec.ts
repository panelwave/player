import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { CommentsDrawerComponent, type Comment, type CommentPost } from './comments-drawer.component';

describe('CommentsDrawerComponent', () => {
  let fixture: ComponentFixture<CommentsDrawerComponent>;
  let component: CommentsDrawerComponent;
  let posted: CommentPost[];
  let liked: string[];
  let loadMore: number[];
  let closed: number;

  const q = <T extends HTMLElement>(sel: string): T | null =>
    fixture.nativeElement.querySelector(sel) as T | null;
  const qa = <T extends HTMLElement>(sel: string): T[] =>
    Array.from(fixture.nativeElement.querySelectorAll(sel) as NodeListOf<T>);
  const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const minutesAgo = (m: number): Date => new Date(Date.now() - m * 60_000);

  const comments: Comment[] = [
    {
      id: 'c1',
      author: 'Ada Lovelace',
      content: 'First!',
      timestamp: minutesAgo(5),
      likes: 3,
      isLiked: true,
      replies: [
        { id: 'r1', author: 'bob', content: 'Nice', timestamp: minutesAgo(0), authorAvatar: 'https://x/bob.png' },
      ],
    },
    { id: 'c2', author: 'Cy', authorAvatar: 'https://x/cy.png', content: 'Hmm', timestamp: minutesAgo(180), likes: 0 },
  ];

  async function set(inputs: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(inputs)) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function type(textarea: HTMLTextAreaElement, value: string): Promise<void> {
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommentsDrawerComponent, TranslateModule.forRoot()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      comments: {
        title: 'Comments',
        sign_in: 'Sign in to comment',
        no_comments: 'No comments yet',
        loading: 'Loading…',
        comment_count_singular: 'comment',
        comment_count_plural: 'comments',
        page_of: 'Page {{current}} of {{total}}',
        reply: 'Reply',
        load_more: 'Load more',
      },
    });
    translate.use('en');

    fixture = TestBed.createComponent(CommentsDrawerComponent);
    component = fixture.componentInstance;
    posted = [];
    liked = [];
    loadMore = [];
    closed = 0;
    component.postComment.subscribe((p) => posted.push(p));
    component.likeComment.subscribe((id) => liked.push(id));
    component.loadMore.subscribe((p) => loadMore.push(p));
    component.close.subscribe(() => closed++);
    await set({ visible: true });
  });

  describe('rendering', () => {
    it('renders nothing while hidden', async () => {
      await set({ visible: false });
      expect(q('.drawer-overlay')).toBeNull();
    });

    it('shows the empty state and sign-in notice for guests', () => {
      expect(text(q('.drawer-title'))).toBe('Comments');
      expect(text(q('.empty-state'))).toBe('No comments yet');
      expect(text(q('.auth-notice'))).toBe('Sign in to comment');
      expect(q('.comment-composer')).toBeNull();
      expect(text(q('.footer-text'))).toBe('0 comments');
    });

    it('shows a loading state only when there are no comments yet', async () => {
      await set({ loading: true });
      expect(text(q('.loading-state'))).toBe('Loading…');
      await set({ comments });
      expect(q('.loading-state')).toBeNull();
    });

    it('renders comments, replies, avatars/initials and relative timestamps', async () => {
      await set({ comments });
      const items = qa<HTMLElement>('.comment-item');
      expect(items.length).toBe(2);
      expect(text(items[0].querySelector('.avatar-placeholder'))).toBe('AL');
      expect(text(items[0].querySelector('.comment-author'))).toBe('Ada Lovelace');
      expect(text(items[0].querySelector('.comment-timestamp'))).toBe('5m ago');
      expect(text(items[0].querySelector('.comment-text'))).toBe('First!');
      const reply = items[0].querySelector('.reply-item') as HTMLElement;
      expect((reply.querySelector('img') as HTMLImageElement).src).toBe('https://x/bob.png');
      expect(text(reply.querySelector('.comment-timestamp'))).toBe('Just now');
      expect((items[1].querySelector('.avatar-image') as HTMLImageElement).alt).toBe('Cy');
      expect(text(items[1].querySelector('.comment-timestamp'))).toBe('3h ago');
      expect(items[1].querySelector('.comment-replies')).toBeNull();
      // guests see no like/reply actions
      expect(items[0].querySelector('.comment-actions .action-btn')).toBeNull();
    });

    it('pluralises the footer count and shows the page indicator', async () => {
      await set({ comments: [comments[0]], currentPage: 2, totalPages: 4 });
      expect(text(q('.footer-text'))).toBe('1 comment • Page 2 of 4');
    });
  });

  describe('helpers', () => {
    it('formats timestamps across all ranges', () => {
      expect(component.formatTimestamp(minutesAgo(0.5))).toBe('Just now');
      expect(component.formatTimestamp(minutesAgo(59))).toBe('59m ago');
      expect(component.formatTimestamp(minutesAgo(60 * 23))).toBe('23h ago');
      expect(component.formatTimestamp(minutesAgo(60 * 24 * 6))).toBe('6d ago');
      const old = minutesAgo(60 * 24 * 30);
      expect(component.formatTimestamp(old)).toBe(old.toLocaleDateString());
    });

    it('formats relative timestamps through translation keys (same English output)', () => {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation(
        'en',
        {
          comments: {
            just_now: 'Just now',
            minutes_ago: '{{count}}m ago',
            hours_ago: '{{count}}h ago',
            days_ago: '{{count}}d ago',
          },
        },
        true
      );
      expect(component.formatTimestamp(minutesAgo(0.5))).toBe('Just now');
      expect(component.formatTimestamp(minutesAgo(5))).toBe('5m ago');
      expect(component.formatTimestamp(minutesAgo(60 * 3))).toBe('3h ago');
      expect(component.formatTimestamp(minutesAgo(60 * 24 * 2))).toBe('2d ago');
    });

    it('localizes relative timestamps for the active language', async () => {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('de', {
        comments: {
          just_now: 'Gerade eben',
          minutes_ago: 'vor {{count}} Min.',
          hours_ago: 'vor {{count}} Std.',
          days_ago: 'vor {{count}} Tg.',
        },
      });
      translate.use('de');
      expect(component.formatTimestamp(minutesAgo(0.5))).toBe('Gerade eben');
      expect(component.formatTimestamp(minutesAgo(5))).toBe('vor 5 Min.');
      expect(component.formatTimestamp(minutesAgo(60 * 3))).toBe('vor 3 Std.');
      expect(component.formatTimestamp(minutesAgo(60 * 24 * 2))).toBe('vor 2 Tg.');

      await set({ comments, visible: true });
      expect(text(q('.comment-timestamp'))).toBe('vor 5 Min.');
    });

    it('computes author initials', () => {
      expect(component.getAuthorInitials('Ada Lovelace')).toBe('AL');
      expect(component.getAuthorInitials('grace brewster hopper')).toBe('GB');
      expect(component.getAuthorInitials('zed')).toBe('ZE');
      expect(component.getAuthorInitials('Z')).toBe('Z');
    });

    it('splits on any whitespace and ignores empty segments', () => {
      expect(component.getAuthorInitials('Jane  Doe')).toBe('JD');
      expect(component.getAuthorInitials(' Bob')).toBe('BO');
      expect(component.getAuthorInitials('  Ann\tLee  ')).toBe('AL');
      expect(component.getAuthorInitials('bo ')).toBe('BO');
    });

    it('returns "?" for empty or whitespace-only names', () => {
      expect(component.getAuthorInitials('')).toBe('?');
      expect(component.getAuthorInitials('   ')).toBe('?');
      expect(component.getAuthorInitials(undefined as unknown as string)).toBe('?');
    });
  });

  describe('authenticated interactions', () => {
    beforeEach(async () => {
      await set({ comments, isAuthenticated: true });
    });

    it('posts a trimmed comment and clears the composer', async () => {
      const composer = q<HTMLTextAreaElement>('.comment-composer textarea') as HTMLTextAreaElement;
      const post = q<HTMLButtonElement>('.comment-composer .post-btn') as HTMLButtonElement;
      expect(post.disabled).toBeTrue();
      await type(composer, '   ');
      expect(post.disabled).toBeTrue();
      await type(composer, '  Great page  ');
      expect(post.disabled).toBeFalse();
      post.click();
      expect(posted).toEqual([{ content: 'Great page' }]);
      expect(component.newCommentContent).toBe('');
    });

    it('ignores blank submissions', () => {
      component.newCommentContent = '   ';
      component.submitComment();
      expect(posted).toEqual([]);
    });

    it('shows like counts and the liked state, and emits likes', () => {
      const items = qa<HTMLElement>('.comment-item');
      const like0 = items[0].querySelector('.comment-actions .action-btn') as HTMLButtonElement;
      const like1 = items[1].querySelector('.comment-actions .action-btn') as HTMLButtonElement;
      expect(like0.classList).toContain('active');
      expect(text(like0)).toBe('3');
      expect(like1.classList).not.toContain('active');
      expect(like1.querySelector(':scope > span')).toBeNull();
      like1.click();
      expect(liked).toEqual(['c2']);
    });

    it('opens a reply composer under the target comment and posts a reply', async () => {
      const replyBtn = qa<HTMLElement>('.comment-item')[1].querySelectorAll('.comment-actions .action-btn')[1];
      (replyBtn as HTMLButtonElement).click();
      fixture.detectChanges();
      const composers = qa<HTMLElement>('.reply-composer');
      expect(composers.length).toBe(1);
      expect(qa<HTMLElement>('.comment-item')[1].querySelector('.reply-composer')).not.toBeNull();

      const post = composers[0].querySelector('.post-btn') as HTMLButtonElement;
      expect(post.disabled).toBeTrue();
      await type(composers[0].querySelector('textarea') as HTMLTextAreaElement, ' Agreed ');
      post.click();
      fixture.detectChanges();
      expect(posted).toEqual([{ content: 'Agreed', replyTo: 'c2' }]);
      expect(component.showReplyComposer).toBeFalse();
      expect(q('.reply-composer')).toBeNull();
    });

    it('cancels a reply from the cancel button', () => {
      (qa<HTMLElement>('.comment-item')[0].querySelectorAll('.comment-actions .action-btn')[1] as HTMLButtonElement).click();
      component.replyContent = 'draft';
      fixture.detectChanges();
      expect(q('.reply-composer')).not.toBeNull();
      q<HTMLButtonElement>('.reply-composer .cancel-btn')?.click();
      fixture.detectChanges();
      expect(component.replyTarget).toBeUndefined();
      expect(component.replyContent).toBe('');
      expect(q('.reply-composer')).toBeNull();
    });

    it('does not submit a blank reply or one without a target', () => {
      component.startReply(comments[0]);
      component.replyContent = '  ';
      component.submitReply();
      component.cancelReply();
      component.replyContent = 'text';
      component.submitReply();
      expect(posted).toEqual([]);
    });
  });

  describe('guest guards', () => {
    it('blocks posting, replying and liking when not authenticated', () => {
      component.newCommentContent = 'hi';
      component.submitComment();
      component.startReply(comments[0]);
      component.replyContent = 'hi';
      component.submitReply();
      component.onLikeComment(comments[0]);
      expect(posted).toEqual([]);
      expect(liked).toEqual([]);
    });
  });

  describe('load more', () => {
    it('requests the next page', async () => {
      await set({ comments, hasMore: true, currentPage: 2 });
      q<HTMLButtonElement>('.load-more-btn')?.click();
      expect(loadMore).toEqual([3]);
    });

    it('shows a spinner and does not request while loading', async () => {
      await set({ comments, hasMore: true, loading: true });
      expect(q('.load-more-btn')).toBeNull();
      expect(q('.load-more .loading-spinner')).not.toBeNull();
      component.onLoadMore();
      expect(loadMore).toEqual([]);
    });

    it('is hidden when there are no more pages', async () => {
      await set({ comments, hasMore: false });
      expect(q('.load-more')).toBeNull();
      component.onLoadMore();
      expect(loadMore).toEqual([]);
    });
  });

  describe('closing', () => {
    it('closes from the close button and resets any reply', () => {
      component.startReply(comments[0]);
      q<HTMLButtonElement>('.close-btn')?.click();
      expect(closed).toBe(1);
      expect(component.showReplyComposer).toBeFalse();
    });

    it('closes on backdrop click but not inside the drawer', () => {
      q<HTMLElement>('.drawer-container')?.click();
      expect(closed).toBe(0);
      q<HTMLElement>('.drawer-overlay')?.click();
      expect(closed).toBe(1);
    });

    it('closes on Enter/Space on the backdrop itself only', () => {
      const overlay = q<HTMLElement>('.drawer-overlay') as HTMLElement;
      q<HTMLElement>('.drawer-container')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(closed).toBe(0);
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      overlay.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBeTrue();
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(closed).toBe(2);
    });

    it('Escape first cancels an open reply, then closes', () => {
      component.startReply(comments[0]);
      const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      window.dispatchEvent(esc);
      expect(esc.defaultPrevented).toBeTrue();
      expect(component.showReplyComposer).toBeFalse();
      expect(closed).toBe(0);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(1);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      expect(closed).toBe(1);
    });

    it('ignores Escape while hidden', async () => {
      await set({ visible: false });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(0);
    });
  });
});
