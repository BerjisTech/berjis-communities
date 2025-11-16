import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  catchError,
  combineLatest,
  distinctUntilChanged,
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

interface GroupVm {
  loading: boolean;
  error: string;
  group: any | null;
  posts: any[];
  users: Record<string, any>;
}

@Component({
  selector: 'app-group-page',
  standalone: true,
  imports: [CommonModule, PostCardComponent, PostCreateComponent],
  templateUrl: './group-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupPageComponent {
  vm$: Observable<GroupVm>;
  feedback = '';
  feedbackError = '';

  private refresh$ = new BehaviorSubject<void>(undefined);
  private currentGroupId: number | null = null;
  private currentSlug = '';

  constructor(private api: ApiService, private route: ActivatedRoute) {
    const slug$ = this.route.paramMap.pipe(
      map((params) => params.get('slug') || ''),
      distinctUntilChanged()
    );
    this.vm$ = combineLatest([slug$, this.refresh$]).pipe(
      switchMap(([slug]) => this.loadGroup(slug)),
      tap((vm) => {
        this.currentGroupId = vm.group?.id ?? null;
        this.currentSlug = vm.group?.slug ?? '';
      }),
      shareReplay(1)
    );
  }

  joinGroup() {
    if (!this.currentGroupId) return;
    this.api.joinGroup(this.currentGroupId).subscribe({
      next: (res) => {
        this.feedback = res.message || 'Joined group!';
        this.feedbackError = '';
      },
      error: (err) => {
        this.feedbackError = err?.error?.message || 'Unable to join group.';
        this.feedback = '';
      },
    });
  }

  openComposer(event: Event) {
    if (!this.currentSlug) return;
    event.preventDefault();
    window.location.href = `/create?group=${encodeURIComponent(this.currentSlug)}`;
  }

  private loadGroup(slug: string): Observable<GroupVm> {
    if (!slug) {
      return of({ loading: false, error: 'Group not found.', group: null, posts: [], users: {} });
    }
    return this.api.getGroupBySlug(slug).pipe(
      switchMap((response) => {
        const group = response?.data;
        if (!group) {
          return of({ loading: false, error: 'Group not found.', group: null, posts: [], users: {} });
        }
        return this.api.feedPublic(120).pipe(
          map((feed) => {
            const items = feed.data || [];
            return items.filter((post: any) => post.group_slug === group.slug);
          }),
          switchMap((posts) => this.hydrateUsers(posts).pipe(map((users) => ({ loading: false, error: '', group, posts, users })))),
          catchError(() => of({ loading: false, error: '', group, posts: [], users: {} }))
        );
      }),
      startWith({ loading: true, error: '', group: null, posts: [], users: {} }),
      catchError(() => of({ loading: false, error: 'Unable to load group right now.', group: null, posts: [], users: {} }))
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
    if (!ids.length) return of({});
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
