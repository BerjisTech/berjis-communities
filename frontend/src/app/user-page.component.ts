import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
import { UserAvatarComponent } from './user-avatar.component';

interface UserVm {
  loading: boolean;
  error: string;
  profile: any | null;
  posts: any[];
  users: Record<string, any>;
  followers: string[];
  following: string[];
  postsCount: number;
  isFollowing: boolean;
}

@Component({
  selector: 'app-user-page',
  standalone: true,
  imports: [CommonModule, PostCardComponent, UserAvatarComponent],
  templateUrl: './user-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserPageComponent implements OnDestroy {
  vm$: Observable<UserVm>;
  feedback = '';
  feedbackError = '';

  private refresh$ = new BehaviorSubject<void>(undefined);
  private currentUserId = '';
  private targetUserId = '';
  private lastVm: UserVm | null = null;

  constructor(private api: ApiService, private route: ActivatedRoute) {
    const username$ = this.route.paramMap.pipe(
      map((params) => (params.get('username') || '').replace('@', '').toLowerCase()),
      distinctUntilChanged()
    );

    this.vm$ = combineLatest([username$, this.refresh$]).pipe(
      switchMap(([username]) => this.loadUserVm(username)),
      tap((vm) => {
        this.lastVm = vm;
        this.targetUserId = (vm.profile?.uuid ?? vm.profile?.id ?? '').toString();
      }),
      shareReplay(1)
    );

    this.api
      .currentUser()
      .then((me) => {
        this.currentUserId = (me?.id || me?.uuid || '').toString();
        if (this.currentUserId) {
          this.refresh$.next(undefined);
        }
      })
      .catch(() => {
        this.currentUserId = '';
      });
  }

  ngOnDestroy(): void {
    this.refresh$.complete();
  }

  toggleFollow() {
    if (!this.targetUserId) {
      return;
    }
    if (!this.currentUserId) {
      this.feedbackError = 'Sign in to follow community members.';
      this.feedback = '';
      return;
    }
    const following = this.lastVm?.isFollowing;
    const request = following ? this.api.unfollow(this.targetUserId) : this.api.follow(this.targetUserId);
    request.subscribe({
      next: (res) => {
        this.feedback = res.message || (following ? 'Unfollowed.' : 'Following!');
        this.feedbackError = '';
        this.refresh$.next(undefined);
      },
      error: (err) => {
        this.feedbackError = err?.error?.message || 'Action failed. Please try again.';
        this.feedback = '';
      },
    });
  }

  private loadUserVm(username: string): Observable<UserVm> {
    if (!username) {
      return of({
        loading: false,
        error: 'User handle missing.',
        profile: null,
        posts: [],
        users: {},
        followers: [],
        following: [],
        postsCount: 0,
        isFollowing: false,
      });
    }
    return this.api.getUserByUsername(username).pipe(
      switchMap((res) => {
        const profile = res?.data;
        const userId = (profile?.uuid ?? profile?.id ?? '').toString();
        if (!userId) {
          return of({
            loading: false,
            error: 'User not found.',
            profile: null,
            posts: [],
            users: {},
            followers: [],
            following: [],
            postsCount: 0,
            isFollowing: false,
          });
        }
        return forkJoin({
          posts: this.api.userPosts(userId, 40).pipe(
            map((resp) => resp.data || []),
            catchError(() => of([]))
          ),
          socials: this.loadSocialStats(userId),
          mini: this.api.usersMini([userId]).pipe(
            map((miniRes) => this.mapUsers(miniRes.data || [], userId, profile)),
            catchError(() => of(this.mapUsers([], userId, profile)))
          ),
        }).pipe(
          map(({ posts, socials, mini }) => {
            const followerSet = new Set(socials.followers.map((id) => id.toString()));
            const isFollowing = !!this.currentUserId && followerSet.has(this.currentUserId);
            return {
              loading: false,
              error: '',
              profile,
              posts,
              users: mini,
              followers: socials.followers,
              following: socials.following,
              postsCount: posts.length,
              isFollowing,
            } as UserVm;
          })
        );
      }),
      startWith({
        loading: true,
        error: '',
        profile: null,
        posts: [],
        users: {},
        followers: [],
        following: [],
        postsCount: 0,
        isFollowing: false,
      }),
      catchError(() =>
        of({
          loading: false,
          error: 'Unable to load user profile.',
          profile: null,
          posts: [],
          users: {},
          followers: [],
          following: [],
          postsCount: 0,
          isFollowing: false,
        })
      )
    );
  }

  private loadSocialStats(userId: string) {
    return forkJoin({
      followers: this.api.followers(userId).pipe(
        map((res) => res.data || []),
        catchError(() => of([]))
      ),
      following: this.api.following(userId).pipe(
        map((res) => res.data || []),
        catchError(() => of([]))
      ),
    });
  }

  private mapUsers(arr: any[], userId: string, profile: any) {
    const mapUsers: Record<string, any> = {};
    for (const entry of arr) {
      const key = (entry?.id ?? entry?.user_id ?? entry?.uuid ?? '').toString();
      if (key) {
        mapUsers[key] = entry;
      }
    }
    if (userId && !mapUsers[userId]) {
      mapUsers[userId] = profile;
    } else if (userId) {
      mapUsers[userId] = { ...mapUsers[userId], ...profile };
    }
    mapUsers[userId].posts_count = (mapUsers[userId].posts_count ?? 0) || 0;
    return mapUsers;
  }

  isOwnProfile(vm: UserVm): boolean {
    const uid = (vm.profile?.uuid ?? vm.profile?.id ?? '').toString();
    return !!uid && uid === this.currentUserId;
  }

  displayName(profile: any | null): string {
    if (!profile) return 'Community member';
    return (
      profile.name ||
      profile.full_name ||
      profile.display_name ||
      profile.username ||
      profile.handle ||
      (profile.email ? profile.email.split('@')[0] : 'Community member')
    );
  }

  displayHandle(profile: any | null): string {
    if (!profile) return '';
    const handle = profile.username || profile.handle;
    if (handle) {
      return '@' + handle;
    }
    if (profile.email) {
      return '@' + profile.email.split('@')[0];
    }
    return '';
  }

  focusTags(profile: any | null): string[] {
    if (!profile) return [];
    const tags = Array.isArray(profile.tags) ? profile.tags : [];
    const focus = Array.isArray(profile.focus) ? profile.focus : [];
    const interests = Array.isArray(profile.interests) ? profile.interests : [];
    const merged = [...tags, ...focus, ...interests]
      .map((tag: any) => String(tag || '').trim())
      .filter((tag: string) => !!tag);
    return Array.from(new Set(merged)).slice(0, 6);
  }

  profileBio(profile: any | null): string {
    if (!profile) return '';
    return profile.bio || profile.headline || profile.about || '';
  }

  profileLocation(profile: any | null): string {
    if (!profile) return '';
    return profile.location || profile.city || profile.region || '';
  }
}
