import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  private svcBase(): string {
    const w: any = (typeof window !== 'undefined') ? (window as any) : {};
    return w.__COMMUNITIES_API__ || 'http://localhost:8090';
  }

  private headers(): HttpHeaders {
    let h = new HttpHeaders({ 'Content-Type': 'application/json' });
    const token = localStorage.getItem('accessToken');
    if (token) { h = h.set('Authorization', `Bearer ${token}`); }
    const devUser = localStorage.getItem('devUserId');
    if (devUser) { h = h.set('X-User-ID', devUser); }
    return h;
  }

  feedPublic(limit = 50) {
    return this.http.get<{ success: boolean; data: any[]; message: string }>(`${this.svcBase()}/v1/feed/public?limit=${limit}`);
  }

  explore(tag: string) {
    const t = tag.startsWith('#') ? tag.substring(1) : tag;
    return this.http.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/explore?tag=${encodeURIComponent(t)}`);
  }

  listCommunities() {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/communities`);
  }

  getCommunityBySlug(slug: string) {
    return this.http.get<{ success: boolean; data: any }>(`${this.svcBase()}/v1/communities/by-slug/${encodeURIComponent(slug)}`);
  }

  listGroups() {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/groups`);
  }

  getGroupBySlug(slug: string) {
    return this.http.get<{ success: boolean; data: any }>(`${this.svcBase()}/v1/groups/by-slug/${encodeURIComponent(slug)}`);
  }
}

export function linkHashtags(text: string): string {
  return (text || '').replace(/(^|\s)#(\w+)/g, (_m, p1, tag) => `${p1}<a href="/explore?tag=${encodeURIComponent(tag)}">#${tag}</a>`);
}
