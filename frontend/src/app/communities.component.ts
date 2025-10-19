import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from './api.service';

@Component({
  selector: 'app-communities',
  standalone: true,
  imports: [CommonModule],
  template: `
  <header style="background:#0b5fff;color:#fff;padding:16px 24px"><h1 style="margin:0">Communities</h1></header>
  <main style="max-width:960px;margin:0 auto;padding:24px">
    <div *ngIf="loading">Loading…</div>
    <div *ngFor="let c of items" style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:8px 0">
      <a [href]="'/c/'+c.slug"><strong>/c/{{c.slug}}</strong></a>
      <div>{{c.description}}</div>
    </div>
  </main>
  `
})
export class CommunitiesComponent implements OnInit {
  items: any[] = [];
  loading = true;
  constructor(private api: ApiService) {}
  ngOnInit() {
    this.api.listCommunities().subscribe({
      next: (r) => { this.items = r.data; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
}
