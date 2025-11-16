import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, formatPostContent } from './api.service';
import { catchError, forkJoin, map, of } from 'rxjs';

@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './explore.component.html'
})
export class ExploreComponent implements OnInit {
  query = '';
  activeTab: 'relevant' | 'latest' | 'users' | 'top' = 'relevant';
  loading = false;

  relevant: any[] = [];
  latest: any[] = [];
  top: any[] = [];
  user: any | null = null;

  constructor(private api: ApiService) {}
  ngOnInit() {
    const q = new URLSearchParams(location.search);
    const tag = q.get('tag') || '';
    if (tag) {
      this.query = '#' + tag.replace(/^#/, '');
      this.search();
    }
  }
  search() {
    const q = (this.query || '').trim();
    if (!q) {
      this.relevant = [];
      this.latest = [];
      this.top = [];
      this.user = null;
      return;
    }
    this.loading = true;

    const tagMatch = q.match(/#([\w-]+)/);
    const tag = tagMatch ? tagMatch[1] : '';
    const handle = q.startsWith('@') ? q.substring(1) : q;

    forkJoin({
      feed: this.api.feedPublic(100, {}).pipe(
        map((res) => res.data || []),
        catchError(() => of([]))
      ),
      tagged: tag
        ? this.api.explore(tag).pipe(
            map((res) => res.data || []),
            catchError(() => of([]))
          )
        : of([]),
      user: handle
        ? this.api
            .getUserByUsername(handle)
            .pipe(
              map((res) => res.data || null),
              catchError(() => of(null))
            )
        : of(null)
    }).subscribe({
      next: ({ feed, tagged, user }) => {
        const allPosts = this.mergePosts(feed, tagged);
        this.buildRankings(allPosts, q);
        this.user = user;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  setTab(tab: 'relevant' | 'latest' | 'users' | 'top') {
    this.activeTab = tab;
  }

  render(s: string) { return formatPostContent(s || ''); }

  private mergePosts(a: any[], b: any[]): any[] {
    const out: any[] = [];
    const seen = new Set<number>();
    for (const arr of [a || [], b || []]) {
      for (const p of arr) {
        const id = Number(p?.id || 0);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(p);
      }
    }
    return out;
  }

  private buildRankings(posts: any[], rawQuery: string) {
    const q = rawQuery.toLowerCase();
    const keywords = q
      .replace(/[#@]/g, ' ')
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => !!s);
    const now = Date.now();

    const scored = (posts || []).map((p) => {
      const title = String(p?.title || '');
      const body = String(p?.body || '');
      const text = (title + ' ' + body).toLowerCase();
      let matchScore = 0;
      for (const kw of keywords) {
        if (!kw) continue;
        if (text.includes(kw)) {
          matchScore += 10;
        }
      }
      const createdMs = p?.created_at ? Date.parse(p.created_at) || now : now;
      const ageHours = Math.max(0, (now - createdMs) / 3.6e6);
      const recencyBoost = 1 / (1 + ageHours / 6);
      const likeCount = Number(p?.like_count || 0);
      const reactCount = Number(p?.reaction_count || 0);
      const commentCount = Number(p?.comment_count || 0);
      const viewCount = Number(p?.view_count || 0);
      const engagement =
        likeCount * 2 + reactCount * 1.5 + commentCount * 3 + viewCount * 0.05;
      const relevanceScore = matchScore + engagement + recencyBoost * 5;
      const topScore = engagement + recencyBoost * 2;
      return { post: p, relevanceScore, topScore, createdMs };
    });

    this.relevant = scored
      .slice()
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .map((x) => x.post);

    this.latest = scored
      .slice()
      .sort((a, b) => b.createdMs - a.createdMs)
      .map((x) => x.post);

    this.top = scored
      .slice()
      .sort((a, b) => b.topScore - a.topScore)
      .map((x) => x.post);
  }
}

