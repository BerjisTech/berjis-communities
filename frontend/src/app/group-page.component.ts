import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from './api.service';

@Component({
  selector: 'app-group-page',
  standalone: true,
  imports: [CommonModule],
  template: `
  <header style="background:#0b5fff;color:#fff;padding:16px 24px"><h1 style="margin:0">Group</h1></header>
  <main style="max-width:960px;margin:0 auto;padding:24px">
    <div *ngIf="loading">Loading…</div>
    <ng-container *ngIf="!loading && group">
      <h2>/g/{{group.slug}}</h2>
      <p>{{group.description}}</p>
    </ng-container>
  </main>
  `
})
export class GroupPageComponent implements OnInit {
  group: any;
  loading = true;
  constructor(private api: ApiService) {}
  ngOnInit() {
    const slug = location.pathname.split('/').pop() || '';
    this.api.getGroupBySlug(slug).subscribe({
      next: (r) => { this.group = r.data; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
}
