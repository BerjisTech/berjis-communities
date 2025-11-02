import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from './api.service';

@Component({
  selector: 'app-story-strip',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './story-strip.component.html'
})
export class StoryStripComponent implements OnInit {
  @Input() me: any | null = null;

  loading = false;
  items: any[] = [];
  users: Record<string, any> = {};

  adding = false;
  caption = '';
  file: File | null = null;
  submitting = false;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.reload();
  }

  onFile(e: any) {
    const f = e?.target?.files?.[0];
    if (f) this.file = f;
  }

  async addStory() {
    if (!this.file) return;
    this.submitting = true;
    try {
      const up = await this.api.upload(this.file).toPromise();
      const media = [{ url: up?.data?.url, kind: up?.data?.kind || 'image' }];
      await this.api.createStory(this.caption, media).toPromise();
      this.caption = '';
      this.file = null;
      this.adding = false;
      this.reload();
    } finally {
      this.submitting = false;
    }
  }

  reload() {
    this.loading = true;
    this.api.listStories().subscribe({
      next: (res) => {
        const own = Array.isArray(res.data?.own) ? res.data!.own : [];
        const others = Array.isArray(res.data?.others) ? res.data!.others : [];
        // First tile: me (add or latest)
        const items: any[] = [];
        if (own.length === 0) {
          items.push({ type: 'add' });
        } else {
          items.push({ type: 'story', ...own[0], user_id: this.me?.id || this.me?.uuid });
        }
        // Then followed (fallback: others)
        for (const it of others) items.push({ type: 'story', ...it });
        this.items = items;
        // Preload user info
        const ids = items.filter(i => i.type === 'story').map(i => i.user_id);
        this.api.usersMini(ids).subscribe((users) => {
          const arr = Array.isArray((users as any)?.data) ? (users as any).data : (users as any);
          for (const u of arr) {
            const key = (u?.id ?? u?.uuid ?? '').toString();
            if (key) this.users[key] = u;
          }
        });
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  nameFor(id: string): string {
    const u = this.users[(id || '').toString()];
    return u?.name || u?.full_name || u?.username || u?.handle || (u?.email ? u.email.split('@')[0] : '');
  }

  avatarFor(id: string): string {
    const u = this.users[(id || '').toString()];
    if (u?.avatarUrl) return u.avatarUrl;
    if (u?.avatar_url) return u.avatar_url;
    if (u?.avatar) return u.avatar;
    const seed = encodeURIComponent((id || 'story')); 
    return `https://api.dicebear.com/7.x/identicon/svg?seed=${seed}`;
  }
}

