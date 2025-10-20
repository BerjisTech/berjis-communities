import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, linkHashtags } from './api.service';
import { map } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './home.component.html'
})
export class HomeComponent implements OnInit {
  posts: any[] = [];
  loading = true;
  users: Record<number, any> = {};
  hoverUser = 0;
  moreFor: number|null = null;
  reactFor: number|null = null;
  emojis = ['👍','❤️','😂','🔥','🎉'];
  viewerOpen = false;
  viewerMedia: any[] = [];
  viewerIndex = 0;
  commentsOpen: Record<number, boolean> = {};
  comments: Record<number, any[]> = {};
  commentText: Record<number, string> = {};
  constructor(private api: ApiService) {}
  ngOnInit() {
    this.api.feedPublic(50).pipe(
      map((r) => r.data || [])
    ).subscribe({
      next: (items) => {
        this.posts = items;
        const ids = Array.from(new Set(items.map((p:any)=>p.user_id).filter(Boolean)));
        if (ids.length) {
          this.api.usersMini(ids).subscribe({
            next: (res) => {
              const arr = res.data || [];
              for (const u of arr) {
                const id = Number(u.id || u.user_id);
                if (id) this.users[id] = u;
              }
              this.loading = false;
            },
            error: () => { this.loading = false; }
          });
        } else {
          this.loading = false;
        }
      },
      error: () => { this.loading = false; }
    });
  }
  render(s: string) { return linkHashtags(s || ''); }

  // User helpers
  userName(id: number) { return this.users[id]?.username || this.users[id]?.handle || ''; }
  fullName(id: number) { return this.users[id]?.full_name || this.users[id]?.name || ''; }
  bio(id: number) { return this.users[id]?.bio || ''; }
  followers(id: number) { return this.users[id]?.followers_count ?? this.users[id]?.followers ?? 0; }
  following(id: number) { return this.users[id]?.following_count ?? this.users[id]?.following ?? 0; }
  postsCount(id: number) { return this.users[id]?.posts_count ?? this.users[id]?.posts ?? 0; }
  avatarUrl(id: number) {
    const u = this.users[id];
    return u?.avatar_url || u?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${id}`;
  }

  // Relative time: s, m, h, d, w; after ~30 days, use dd MM, YY
  timeAgo(iso: string): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - then) / 1000));
    const m = 60, h = 3600, d = 86400, w = 604800;
    if (diff < m) return `${diff}s`;
    if (diff < h) return `${Math.floor(diff/m)}m`;
    if (diff < d) return `${Math.floor(diff/h)}h`;
    if (diff < w*4) return `${Math.floor(diff/d)}d`;
    // Fallback to date: dd MM, YY (numeric month)
    const date = new Date(then);
    const dd = String(date.getDate()).padStart(2,'0');
    const mm = String(date.getMonth()+1).padStart(2,'0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd} ${mm}, ${yy}`;
  }

  // Media viewer helpers
  openViewer(p: any) { this.viewerMedia = p.media || []; this.viewerIndex = 0; this.viewerOpen = true; }
  closeViewer() { this.viewerOpen = false; this.viewerMedia = []; this.viewerIndex = 0; }
  nextMedia() { if (!this.viewerMedia.length) return; this.viewerIndex = (this.viewerIndex + 1) % this.viewerMedia.length; }
  prevMedia() { if (!this.viewerMedia.length) return; this.viewerIndex = (this.viewerIndex - 1 + this.viewerMedia.length) % this.viewerMedia.length; }

  // Engagement actions
  toggleLike(p: any) {
    const id = p.id;
    // naive toggle: try like, if error then unlike
    this.api.likePost(id).subscribe({
      next: (r) => { p.like_count = r.data?.like_count ?? p.like_count; },
      error: () => {
        this.api.unlikePost(id).subscribe({ next: (r2) => { p.like_count = r2.data?.like_count ?? p.like_count; } });
      }
    });
  }
  react(p: any, emoji: string) {
    const id = p.id;
    this.api.reactPost(id, emoji).subscribe({ next: (r) => { p.reaction_count = r.data?.reaction_count ?? p.reaction_count; this.reactFor = null; } });
  }
  recordView(p: any) {
    this.api.viewPost(p.id).subscribe({ next: (r) => { p.view_count = r.data?.view_count ?? p.view_count; } });
  }
  // Comments
  toggleComments(p: any) {
    this.commentsOpen[p.id] = !this.commentsOpen[p.id];
    if (this.commentsOpen[p.id] && !this.comments[p.id]) {
      this.api.listComments(p.id).subscribe({ next: (res) => { this.comments[p.id] = res.data || []; } });
    }
  }
  submitComment(p: any) {
    const body = (this.commentText[p.id] || '').trim();
    if (!body) return;
    this.api.createComment(p.id, body).subscribe({
      next: () => {
        this.commentText[p.id] = '';
        this.api.listComments(p.id).subscribe({ next: (r2) => { this.comments[p.id] = r2.data || []; p.comment_count = (this.comments[p.id] || []).length; } });
      }
    });
  }
}
