import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, linkHashtags } from './api.service';

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './explore.component.html'
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

