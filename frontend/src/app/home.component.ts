import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, linkHashtags } from './api.service';
import { map } from 'rxjs';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html'
})
export class HomeComponent implements OnInit {
  posts: any[] = [];
  loading = true;
  users: Record<number, any> = {};
  hoverUser = 0;
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
}
