import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { map } from 'rxjs';
import { ApiService } from './api.service';
import { PostCardComponent } from './post-card.component';
import { PostCreateComponent } from "./post-create.component";

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, PostCardComponent, PostCreateComponent],
  templateUrl: './home.component.html'
})
export class HomeComponent implements OnInit {
  posts: any[] = [];
  loading = true;
  users: Record<string, any> = {};
  emojis = ['👍', '❤️', '😂', '🎉', '😢'];

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.currentUser().then(user => {
      const key = this.userKey(user?.id ?? user?.uuid);
      if (key) this.users[key] = user;
    }).catch(() => {});

    this.api.feedPublic(50).pipe(
      map((response) => response.data || [])
    ).subscribe({
      next: (items) => {
        this.posts = items;
        const ids = Array.from(new Set(items.map((post: any) => this.userKey(post?.user_id)).filter(Boolean)));
        if (!ids.length) {
          this.loading = false;
          return;
        }
        this.api.usersMini(ids).subscribe({
          next: (res) => {
            const arr = res.data || [];
            for (const u of arr) {
              const key = this.userKey(u?.id ?? u?.user_id ?? u?.uuid);
              if (key) this.users[key] = u;
            }
            this.loading = false;
          },
          error: () => { this.loading = false; }
        });
      },
      error: () => { this.loading = false; }
    });
  }

  private userKey(source: any): string {
    if (source === null || source === undefined) return '';
    const value = source.toString().trim();
    return value;
  }
}
