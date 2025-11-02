import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { PostCardComponent } from './post-card.component';

@Component({
  selector: 'app-user-posts',
  standalone: true,
  imports: [CommonModule, PostCardComponent],
  template: `
  <main class="max-w-4xl mx-auto p-6 h-[100vh] overflow-x-hidden overflow-y-auto">
    <h2 class="text-xl font-bold mb-4">My Posts</h2>
    <div *ngIf="loading">Loading…</div>
    <app-post-card *ngFor="let post of posts" [post]="post" [users]="users"></app-post-card>
    <div *ngIf="!loading && posts.length === 0" class="text-slate-500">No posts yet.</div>
  </main>
  `
})
export class UserPostsComponent implements OnInit {
  posts: any[] = [];
  users: Record<string, any> = {};
  loading = true;

  constructor(private api: ApiService, private router: Router) {}

  async ngOnInit() {
    try {
      const me = await this.api.currentUser();
      const uid = (me?.id || me?.uuid || '').toString();
      if (!uid) { this.router.navigateByUrl('/'); return; }
      this.users[uid] = me;
      this.api.userPosts(uid, 100).subscribe({
        next: (res) => { this.posts = res.data || []; this.loading = false; },
        error: () => { this.loading = false; }
      });
    } catch {
      this.router.navigateByUrl('/');
    }
  }
}

