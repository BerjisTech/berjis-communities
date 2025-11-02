import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

type MiniUser = Record<string, any>;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private coreBase = environment.apiBase;
  private meCache: { data: any; ts: number } | null = null;
  private meInFlight: Promise<any> | null = null;

  constructor(private http: HttpClient) {}

  private svcBase(): string {
    const w: any = (typeof window !== 'undefined') ? (window as any) : {};
    return w.__COMMUNITIES_API__ || 'https://communities-api.berjis.tech';
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

  createCommunity(body: { name: string; slug: string; description?: string; visibility?: string; access?: string; hashtags?: string[] }) {
    return this.http.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/communities`, body, { headers: this.headers() });
  }

  createGroup(body: { name: string; slug: string; description?: string; visibility?: string }) {
    return this.http.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/groups`, body, { headers: this.headers() });
  }

  joinCommunity(id: number) {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/communities/${id}/join`, {}, { headers: this.headers() });
  }

  joinGroup(id: number) {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/groups/${id}/join`, {}, { headers: this.headers() });
  }

  createPostGeneric(body: { title?: string; body?: string; kind?: string; visibility?: 'public' | 'private'; community_id?: number; channel_id?: number; group_id?: number; parent_post_id?: number; hashtags?: string[] }) {
    return this.http.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/posts`, body, { headers: this.headers() });
  }

  tagsSuggest(q: string, limit = 10) {
    return this.http.get<{ success: boolean; data: { name: string; count: number }[] }>(`${this.svcBase()}/v1/tags/suggest?q=${encodeURIComponent(q)}&limit=${limit}`);
  }

  async currentUser(force = false): Promise<any | null> {
    if (!force && this.meCache && Date.now() - this.meCache.ts < 30_000) {
      return this.meCache.data;
    }
    if (!force && this.meInFlight) {
      return this.meInFlight;
    }
    const request = firstValueFrom(this.http.get<{ success?: boolean; data?: any }>(`${this.coreBase}/v1/me`, { withCredentials: true }))
      .then(res => {
        const data = (res as any)?.data ?? res;
        this.meCache = { data, ts: Date.now() };
        return data;
      })
      .catch(err => {
        this.meCache = null;
        throw err;
      })
      .finally(() => {
        this.meInFlight = null;
      });
    this.meInFlight = request;
    return request;
  }

  usersMini(ids: Array<string | number>) {
    const uniq = Array.from(new Set(
      ids
        .map(id => (id ?? '').toString().trim())
        .filter(id => id.length > 0)
    ));
    const query = uniq.map(id => encodeURIComponent(id)).join(',');
    return this.http.get<{ success: boolean; data: MiniUser[] }>(
      `${this.svcBase()}/v1/users/mini?ids=${encodeURIComponent(query)}`,
      { headers: this.headers(), withCredentials: true }
    );
  }

  // Stories
  listStories() {
    return this.http.get<{ success: boolean; data: { own: any[]; others: any[] } }>(`${this.svcBase()}/v1/stories`, { headers: this.headers() });
  }

  createStory(caption: string, media: Array<{ url: string; kind: string }>) {
    const payload: any = { kind: 'story', visibility: 'public', body: caption || '', media };
    return this.http.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/posts`, payload, { headers: this.headers() });
  }

  // Follow graph
  follow(userId: string) {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/users/${userId}/follow`, {}, { headers: this.headers() });
  }
  unfollow(userId: string) {
    return this.http.delete<{ success: boolean; message: string }>(`${this.svcBase()}/v1/users/${userId}/follow`, { headers: this.headers() });
  }
  removeFollower(userId: string, followerId: string) {
    return this.http.delete<{ success: boolean; message: string }>(`${this.svcBase()}/v1/users/${userId}/followers/${followerId}`, { headers: this.headers() });
  }
  followers(userId: string) {
    return this.http.get<{ success: boolean; data: string[] }>(`${this.svcBase()}/v1/users/${userId}/followers`, { headers: this.headers() });
  }
  following(userId: string) {
    return this.http.get<{ success: boolean; data: string[] }>(`${this.svcBase()}/v1/users/${userId}/following`, { headers: this.headers() });
  }

  // User posts
  userPosts(userId: string, limit = 50) {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/users/${userId}/posts?limit=${limit}`);
  }
  postsCount(userId: string) {
    return this.http.get<{ success: boolean; data: { count: number } }>(`${this.svcBase()}/v1/users/${userId}/posts/count`);
  }

  likePost(id: number) {
    return this.http.post<{ success: boolean; data: { like_count: number } }>(`${this.svcBase()}/v1/posts/${id}/like`, {}, { headers: this.headers() });
  }

  unlikePost(id: number) {
    return this.http.delete<{ success: boolean; data: { like_count: number } }>(`${this.svcBase()}/v1/posts/${id}/like`, { headers: this.headers() });
  }

  reactPost(id: number, emoji: string) {
    return this.http.post<{ success: boolean; data: { reaction_count: number } }>(`${this.svcBase()}/v1/posts/${id}/react`, { emoji }, { headers: this.headers() });
  }

  unreactPost(id: number, emoji: string) {
    return this.http.delete<{ success: boolean; data: { reaction_count: number } }>(`${this.svcBase()}/v1/posts/${id}/react?emoji=${encodeURIComponent(emoji)}`, { headers: this.headers() });
  }

  viewPost(id: number) {
    return this.http.post<{ success: boolean; data: { view_count: number } }>(`${this.svcBase()}/v1/posts/${id}/view`, {});
  }

  listComments(postId: number) {
    return this.http.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/posts/${postId}/comments`);
  }

  createComment(postId: number, body: string, parent_comment_id?: number) {
    const payload: any = { body };
    if (parent_comment_id) payload.parent_comment_id = parent_comment_id;
    return this.http.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/posts/${postId}/comments`, payload, { headers: this.headers() });
  }

  upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    let h = new HttpHeaders();
    const token = localStorage.getItem('accessToken');
    if (token) { h = h.set('Authorization', `Bearer ${token}`); }
    const devUser = localStorage.getItem('devUserId');
    if (devUser) { h = h.set('X-User-ID', devUser); }
    return this.http.post<{ success: boolean; data: { url: string; kind: 'image' | 'video' | 'other' } }>(`${this.svcBase()}/v1/uploads`, fd, { headers: h });
  }

  setCommunityMemberRole(communityId: number, userId: string, role: 'admin' | 'member') {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/communities/${communityId}/members/${userId}/role`, { role }, { headers: this.headers() });
  }

  communityBan(communityId: number, userId: string, action: 'ban' | 'unban') {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/communities/${communityId}/bans/${userId}`, { action }, { headers: this.headers() });
  }

  setGroupMemberRole(groupId: number, userId: string, role: 'admin' | 'mod' | 'member') {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/groups/${groupId}/members/${userId}/role`, { role }, { headers: this.headers() });
  }

  groupBan(groupId: number, userId: string, action: 'ban' | 'unban') {
    return this.http.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/groups/${groupId}/bans/${userId}`, { action }, { headers: this.headers() });
  }
}

export function linkHashtags(text: string): string {
  return (text || '').replace(/(^|\s)#(\w+)/g, (_m, p1, tag) => `${p1}<a href="/explore?tag=${encodeURIComponent(tag)}">#${tag}</a>`);
}
