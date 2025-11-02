import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from './api.service';
import { PostCardComponent } from './post-card.component';

@Component({
  selector: 'app-user-public-posts',
  standalone: true,
  imports: [CommonModule, PostCardComponent],
  template: `
  <main class="max-w-4xl mx-auto p-6 h-[100vh] overflow-x-hidden overflow-y-auto">
    <h2 class="text-xl font-bold mb-4">{{ title }}</h2>
    <div *ngIf="loading">Loading…</div>
    <div *ngIf="error" class="text-red-600">{{ error }}</div>
    <app-post-card *ngFor="let post of posts" [post]="post" [users]="users"></app-post-card>
    <div *ngIf="!loading && !error && posts.length === 0" class="text-slate-500">No posts yet.</div>
  </main>
  `
})
export class UserPublicPostsComponent implements OnInit {
  posts: any[] = [];
  users: Record<string, any> = {};
  title = 'User Posts';
  loading = true;
  error = '';

  constructor(private api: ApiService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.route.paramMap.subscribe(async (pm) => {
      const username = (pm.get('username') || '').trim();
      if (!username) { this.router.navigateByUrl('/'); return; }
      this.title = `@${username}`;
      this.loading = true;
      this.error = '';
      try {
        // Resolve username to a user via communities proxy -> core API
        const res: any = await this.apiGet(`/v1/users/by-username/${encodeURIComponent(username)}`);
        const u = res?.data || res;
        const uid = (u?.id || u?.uuid || '').toString();
        if (!uid) { this.error = 'User not found'; this.loading = false; return; }
        this.users[uid] = u;
        this.api.userPosts(uid, 100).subscribe({
          next: (r) => { this.posts = r.data || []; this.loading = false; },
          error: () => { this.error = 'Failed to load posts'; this.loading = false; }
        });
      } catch {
        this.error = 'User not found';
        this.loading = false;
      }
    });
  }

  private apiGet<T>(path: string): Promise<T> {
    // lightweight GET via fetch to avoid adding more methods to ApiService for now
    const base = (window as any).__COMMUNITIES_API__ || 'https://communities-api.berjis.tech';
    const headers: any = {};
    const token = localStorage.getItem('accessToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const devUser = localStorage.getItem('devUserId');
    if (devUser) headers['X-User-ID'] = devUser;
    return fetch(base + path, { headers, credentials: 'include' }).then(r => r.json());
  }
}

