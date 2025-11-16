import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { map } from 'rxjs';
import { ApiService } from './api.service';
import { PostCardComponent } from './post-card.component';
import { PostCreateComponent } from './post-create.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, PostCardComponent, PostCreateComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('feedSentinel', { static: true }) feedSentinel!: ElementRef<HTMLDivElement>;

  posts: any[] = [];
  loadingInitial = true;
  loadingMore = false;
  endOfFeed = false;
  cursor: number | null = null;
  users: Record<string, any> = {};
  emojis = ['✨', '🔥', '⚡', '🛰️', '🎯'];
  private observer?: IntersectionObserver;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api
      .currentUser()
      .then((user) => {
        const key = this.userKey(user?.id ?? user?.uuid);
        if (key) this.users[key] = user;
      })
      .catch(() => undefined);

    this.loadMore();
  }

  ngAfterViewInit() {
    if (!this.feedSentinel) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.loadMore();
        }
      },
      { rootMargin: '200px' }
    );
    this.observer.observe(this.feedSentinel.nativeElement);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  private userKey(source: any): string {
    if (source === null || source === undefined) return '';
    return source.toString().trim();
  }

  onPosted(newPost: any) {
    if (!newPost) return;
    this.posts = [newPost, ...this.posts];
    const uid = this.userKey(newPost.user_id);
    if (uid && !this.users[uid]) {
      this.api
        .currentUser()
        .then((me) => {
          const key = this.userKey(me?.id ?? me?.uuid);
          if (key) this.users[key] = me;
        })
        .catch(() => undefined);
    }
  }

  loadMore() {
    if (this.loadingMore || this.endOfFeed) return;
    const before = this.cursor ?? undefined;
    this.loadingMore = true;
    this.api
      .feedPublic(25, { before })
      .pipe(map((response) => response.data || []))
      .subscribe({
        next: (items) => {
          if (!items.length) {
            this.endOfFeed = true;
          } else {
            this.posts = [...this.posts, ...items];
            const ids = Array.from(new Set(items.map((post: any) => this.userKey(post?.user_id)).filter(Boolean)));
            if (ids.length) {
              this.api.usersMini(ids).subscribe({
                next: (res) => {
                  const arr = res.data || [];
                  for (const u of arr) {
                    const key = this.userKey(u?.id ?? u?.user_id ?? u?.uuid);
                    if (key) this.users[key] = u;
                  }
                },
              });
            }
            const last = items[items.length - 1];
            if (last?.id) {
              this.cursor = Number(last.id);
            }
            if (items.length < 25) {
              this.endOfFeed = true;
            }
          }
          this.loadingInitial = false;
          this.loadingMore = false;
        },
        error: () => {
          this.loadingInitial = false;
          this.loadingMore = false;
        },
      });
  }
}
