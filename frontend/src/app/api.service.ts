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

  // Creation
  createCommunity(body: { name: string; slug: string; description?: string; visibility?: string; access?: string; hashtags?: string[] }) {
    return this.http.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/communities`, body, { headers: this.headers() });
  }

  createGroup(body: { name: string; slug: string; description?: string; visibility?: string }) {
    return this.http.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/groups`, body, { headers: this.headers() });
  }

  // Membership
  joinCommunity(id: number) {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/communities/${id}/join`, {}, { headers: this.headers() });
  }

  joinGroup(id: number) {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/groups/${id}/join`, {}, { headers: this.headers() });
  }

  // Generic post creation
  createPostGeneric(body: { title?: string; body?: string; kind?: string; visibility?: 'public'|'private'; community_id?: number; channel_id?: number; group_id?: number; parent_post_id?: number; hashtags?: string[] }) {
    return this.http.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/posts`, body, { headers: this.headers() });
  }

  tagsSuggest(q: string, limit = 10) {
    return this.http.get<{ success: boolean; data: { name: string; count: number }[] }>(`${this.svcBase()}/v1/tags/suggest?q=${encodeURIComponent(q)}&limit=${limit}`);
  }

  // User profiles (mini) via Communities proxy to Core API
  usersMini(ids: number[]) {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (!uniq.length) return this.http.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/users/mini?ids=`);
    return this.http.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/users/mini?ids=${uniq.join(',')}`);
  }

  // Admin actions (server enforces permission)
  setCommunityMemberRole(communityId: number, userId: number, role: 'admin' | 'member') {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/communities/${communityId}/members/${userId}/role`, { role }, { headers: this.headers() });
  }

  communityBan(communityId: number, userId: number, action: 'ban' | 'unban') {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/communities/${communityId}/bans/${userId}`, { action }, { headers: this.headers() });
  }

  setGroupMemberRole(groupId: number, userId: number, role: 'admin' | 'mod' | 'member') {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/groups/${groupId}/members/${userId}/role`, { role }, { headers: this.headers() });
  }

  groupBan(groupId: number, userId: number, action: 'ban' | 'unban') {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/groups/${groupId}/bans/${userId}`, { action }, { headers: this.headers() });
  }
}

export function linkHashtags(text: string): string {
  return (text || '').replace(/(^|\s)#(\w+)/g, (_m, p1, tag) => `${p1}<a href="/explore?tag=${encodeURIComponent(tag)}">#${tag}</a>`);
}
