import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  BehaviorSubject,
  Observable,
  catchError,
  combineLatest,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { ApiService } from './api.service';
import { PostCardComponent } from './post-card.component';
import { PostCreateComponent } from './post-create.component';

interface CommunityVm {
  loading: boolean;
  error: string;
  community: any | null;
  channels: any[];
  posts: any[];
  users: Record<string, any>;
  message: string;
}

@Component({
  selector: 'app-community-page',
  standalone: true,
  imports: [CommonModule, FormsModule, PostCardComponent, PostCreateComponent],
  templateUrl: './community-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommunityPageComponent {
  vm$: Observable<CommunityVm>;
  feedback = '';
  feedbackError = '';
  adminInput = '';

  private refresh$ = new BehaviorSubject<void>(undefined);
  private currentCommunityId: number | null = null;
  private currentSlug = '';

  constructor(private api: ApiService, private route: ActivatedRoute) {
    const slug$ = this.route.paramMap.pipe(
      map((params) => params.get('slug') || ''),
      distinctUntilChanged()
    );
    this.vm$ = combineLatest([slug$, this.refresh$]).pipe(
      switchMap(([slug]) => this.loadCommunity(slug)),
      tap((vm) => {
        this.currentCommunityId = vm.community?.id ?? null;
        this.currentSlug = vm.community?.slug ?? '';
      }),
      shareReplay(1)
    );
  }

  joinCommunity() {
    if (!this.currentCommunityId) return;
    this.api.joinCommunity(this.currentCommunityId).subscribe({
      next: (res) => {
        this.feedback = res.message || 'Joined community!';
        this.feedbackError = '';
        this.refresh$.next(undefined);
      },
      error: (err) => {
        this.feedbackError = err?.error?.message || 'Unable to join community.';
        this.feedback = '';
      },
    });
  }

  openComposer(event: Event) {
    if (!this.currentSlug) return;
    event.preventDefault();
    window.location.href = `/create?community=${encodeURIComponent(this.currentSlug)}`;
  }

  setRole(role: 'admin' | 'member') {
    if (!this.currentCommunityId) return;
    const userId = this.adminInput.trim();
    if (!userId) return;
    this.api.setCommunityMemberRole(this.currentCommunityId, userId, role).subscribe({
      next: (res) => {
        this.feedback = res.message || 'Role updated.';
        this.feedbackError = '';
        this.adminInput = '';
      },
      error: (err) => {
        this.feedbackError = err?.error?.message || 'Unable to update role.';
        this.feedback = '';
      },
    });
  }

  ban(action: 'ban' | 'unban') {
    if (!this.currentCommunityId) return;
    const userId = this.adminInput.trim();
    if (!userId) return;
    this.api.communityBan(this.currentCommunityId, userId, action).subscribe({
      next: (res) => {
        this.feedback = res.message || 'Action applied.';
        this.feedbackError = '';
        this.adminInput = '';
      },
      error: (err) => {
        this.feedbackError = err?.error?.message || 'Unable to update moderation state.';
        this.feedback = '';
      },
    });
  }

  private loadCommunity(slug: string): Observable<CommunityVm> {
    if (!slug) {
      return of({
        loading: false,
        error: 'Community not found.',
        community: null,
        channels: [],
        posts: [],
        users: {},
        message: '',
      });
    }
    return this.api.getCommunityBySlug(slug).pipe(
      switchMap((response) => {
        const community = response?.data;
        if (!community) {
          return of({
            loading: false,
            error: 'Community not found.',
            community: null,
            channels: [],
            posts: [],
            users: {},
            message: '',
          });
        }
        return forkJoin({
          channels: this.api.getCommunityChannels(community.id).pipe(
            map((res) => res.data || []),
            catchError(() => of([]))
          ),
          posts: this.api.feedPublic(150).pipe(
            map((feed) => {
              const items = feed.data || [];
              return items.filter((post: any) => post.community_slug === community.slug);
            }),
            catchError(() => of([]))
          ),
        }).pipe(
          switchMap(({ channels, posts }) =>
            this.hydrateUsers(posts).pipe(
              map((users) => ({
                loading: false,
                error: '',
                community,
                channels,
                posts,
                users,
                message: '',
              }))
            )
          )
        );
      }),
      startWith({
        loading: true,
        error: '',
        community: null,
        channels: [],
        posts: [],
        users: {},
        message: '',
      }),
      catchError(() =>
        of({
          loading: false,
          error: 'Unable to load community right now.',
          community: null,
          channels: [],
          posts: [],
          users: {},
          message: '',
        })
      )
    );
  }

  private hydrateUsers(posts: any[]): Observable<Record<string, any>> {
    const ids = Array.from(
      new Set(
        (posts || [])
          .map((post: any) => (post?.user_id ?? '').toString())
          .filter((id: string) => id.length > 0)
      )
    );
    if (!ids.length) {
      return of({});
    }
    return this.api.usersMini(ids).pipe(
      map((res) => {
        const out: Record<string, any> = {};
        for (const entry of res.data || []) {
          const key = (entry?.id ?? entry?.uuid ?? '').toString();
          if (key) out[key] = entry;
        }
        return out;
      }),
      catchError(() => of({}))
    );
  }
}
