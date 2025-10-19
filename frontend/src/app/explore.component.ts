import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, linkHashtags } from './api.service';

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  <header style="background:#0b5fff;color:#fff;padding:16px 24px"><h1 style="margin:0">Explore</h1></header>
  <main style="max-width:960px;margin:0 auto;padding:24px">
    <input placeholder="#hashtag" [(ngModel)]="tag" (keyup.enter)="search()" style="padding:8px;border:1px solid #ddd;border-radius:6px" />
    <button (click)="search()" style="margin-left:8px">Search</button>
    <div *ngIf="loading">Loading…</div>
    <article *ngFor="let p of posts" style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:8px 0">
      <div style="font-weight:600" [innerText]="p.title"></div>
      <div [innerHTML]="render(p.body)"></div>
    </article>
  </main>
  `
})
export class ExploreComponent implements OnInit {
  tag = '';
  posts: any[] = [];
  loading = false;
  constructor(private api: ApiService) {}
  ngOnInit() {
    const q = new URLSearchParams(location.search);
    const t = q.get('tag') || '';
    if (t) { this.tag = t; this.search(); }
  }
  search() {
    this.loading = true;
    this.api.explore(this.tag).subscribe({
      next: (r) => { this.posts = r.data; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
  render(s: string) { return linkHashtags(s || ''); }
}
