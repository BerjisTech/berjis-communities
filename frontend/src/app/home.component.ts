import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, linkHashtags } from './api.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  template: `
  <header style="background:#0b5fff;color:#fff;padding:16px 24px">
    <h1 style="margin:0">Home</h1>
    <nav><a style="color:#fff;margin-right:12px" href="/communities">Communities</a><a style="color:#fff;margin-right:12px" href="/explore">Explore</a></nav>
  </header>
  <main style="max-width:960px;margin:0 auto;padding:24px">
    <section style="margin-bottom:16px">
      <h3>Stories</h3>
      <div>Coming soon (24h status with green avatar ring)</div>
    </section>
    <section>
      <h3>Public Feed</h3>
      <div *ngIf="loading">Loading…</div>
      <article *ngFor="let p of posts" style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:8px 0">
        <div style="font-weight:600" [innerText]="p.title"></div>
        <div [innerHTML]="render(p.body)"></div>
        <small *ngIf="p.community_slug">in <a [href]="'/c/'+p.community_slug">/c/{{p.community_slug}}</a></small>
        <small *ngIf="p.group_slug">in <a [href]="'/g/'+p.group_slug">/g/{{p.group_slug}}</a></small>
      </article>
    </section>
  </main>
  `
})
export class HomeComponent implements OnInit {
  posts: any[] = [];
  loading = true;
  constructor(private api: ApiService) {}
  ngOnInit() {
    this.api.feedPublic(50).subscribe({
      next: (r) => { this.posts = r.data; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
  render(s: string) { return linkHashtags(s || ''); }
}
