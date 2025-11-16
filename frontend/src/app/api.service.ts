import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, firstValueFrom, from, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { CoreAuthService } from '@berjis/angular-auth';

type MiniUser = Record<string, any>;

@Injectable({ providedIn: 'root' })
export class ApiService {
  private coreBase = environment.apiBase;
  private meCache: { data: any; ts: number } | null = null;
  private meInFlight: Promise<any> | null = null;

  constructor(private http: HttpClient, private auth: CoreAuthService) {}

  private svcBase(): string {
    const w: any = (typeof window !== 'undefined') ? (window as any) : {};
    return w.__COMMUNITIES_API__ || 'https://communities-api.berjis.tech';
  }

  private headers(): HttpHeaders {
    let h = new HttpHeaders({ 'Content-Type': 'application/json' });
    const devUser = localStorage.getItem('devUserId');
    if (devUser) { h = h.set('X-User-UUID', devUser); }
    return h;
  }

  // Common request helpers with 401 refresh+retry exactly once
  private addCommonOptions(opts?: { headers?: HttpHeaders; withCredentials?: boolean }): { headers: HttpHeaders; withCredentials: boolean } {
    const base = { headers: this.headers(), withCredentials: true } as { headers: HttpHeaders; withCredentials: boolean };
    if (opts?.headers) base.headers = opts.headers;
    if (typeof opts?.withCredentials === 'boolean') base.withCredentials = opts.withCredentials;
    return base;
  }

  private withRetry<T>(factory: () => Observable<T>): Observable<T> {
    let retried = false;
    return factory().pipe(
      catchError((err: any) => {
        const status = err?.status ?? err?.statusCode;
        if (status === 401 && !retried) {
          retried = true;
          return from(this.auth.ensureAuth({ force: true })).pipe(switchMap(() => factory()));
        }
        return throwError(() => err);
      })
    );
  }

  private get<T>(url: string, opts?: { headers?: HttpHeaders; withCredentials?: boolean }) {
    const o = this.addCommonOptions(opts);
    return this.withRetry<T>(() => this.http.get<T>(url, o));
  }
  private post<T>(url: string, body: any, opts?: { headers?: HttpHeaders; withCredentials?: boolean }) {
    const o = this.addCommonOptions(opts);
    return this.withRetry<T>(() => this.http.post<T>(url, body, o));
  }
  private delete<T>(url: string, opts?: { headers?: HttpHeaders; withCredentials?: boolean }) {
    const o = this.addCommonOptions(opts);
    return this.withRetry<T>(() => this.http.delete<T>(url, o));
  }

  feedPublic(limit = 50, opts?: { before?: number | null; community?: string; group?: string }) {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (opts?.before) params.set('before', String(opts.before));
    if (opts?.community) params.set('community', opts.community);
    if (opts?.group) params.set('group', opts.group);
    const query = params.toString();
    const url = query ? `${this.svcBase()}/v1/feed/public?${query}` : `${this.svcBase()}/v1/feed/public`;
    return this.get<{ success: boolean; data: any[]; message: string }>(url);
  }

  explore(tag: string) {
    const t = tag.startsWith('#') ? tag.substring(1) : tag;
    return this.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/explore?tag=${encodeURIComponent(t)}`);
  }

  listCommunities() {
    return this.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/communities`);
  }

  getCommunityBySlug(slug: string) {
    return this.get<{ success: boolean; data: any }>(`${this.svcBase()}/v1/communities/by-slug/${encodeURIComponent(slug)}`);
  }

  getCommunityChannels(id: number) {
    return this.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/communities/${id}/channels`);
  }

  listGroups() {
    return this.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/groups`);
  }

  getGroupBySlug(slug: string) {
    return this.get<{ success: boolean; data: any }>(`${this.svcBase()}/v1/groups/by-slug/${encodeURIComponent(slug)}`);
  }

  getChannelPosts(channelId: number) {
    return this.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/channels/${channelId}/posts`);
  }

  getUserByUsername(username: string) {
    const handle = username.startsWith('@') ? username.substring(1) : username;
    return this.get<{ success: boolean; data: any }>(`${this.svcBase()}/v1/users/by-username/${encodeURIComponent(handle)}`);
  }

  createCommunity(body: { name: string; slug: string; description?: string; visibility?: string; access?: string; hashtags?: string[] }) {
    return this.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/communities`, body);
  }

  createGroup(body: { name: string; slug: string; description?: string; visibility?: string }) {
    return this.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/groups`, body);
  }

  joinCommunity(id: number) {
    return this.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/communities/${id}/join`, {});
  }

  joinGroup(id: number) {
    return this.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/groups/${id}/join`, {});
  }

  createPostGeneric(body: { title?: string; body?: string; kind?: string; visibility?: 'public' | 'private'; community_id?: number; channel_id?: number; group_id?: number; parent_post_id?: number; hashtags?: string[] }) {
    return this.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/posts`, body);
  }

  tagsSuggest(q: string, limit = 10) {
    return this.get<{ success: boolean; data: { name: string; count: number }[] }>(`${this.svcBase()}/v1/tags/suggest?q=${encodeURIComponent(q)}&limit=${limit}`);
  }

  async currentUser(force = false): Promise<any | null> {
    if (!force && this.meCache && Date.now() - this.meCache.ts < 30_000) {
      return this.meCache.data;
    }
    if (!force && this.meInFlight) {
      return this.meInFlight;
    }
    await this.auth.ensureAuth(force ? { force: true } : { maxAgeMs: 1500 });
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
    const isUUID = (s: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
    const uniq = Array.from(
      new Set(
        ids
          .map((id) => (id ?? '').toString().trim())
          .filter((id) => id.length > 0 && isUUID(id))
      )
    );
    const query = uniq.join(',');
    return this.get<{ success: boolean; data: MiniUser[] }>(
      `${this.svcBase()}/v1/users/mini?ids=${encodeURIComponent(query)}`
    );
  }

  // Stories
  listStories() {
    return this.get<{ success: boolean; data: { own: any[]; others: any[] } }>(`${this.svcBase()}/v1/stories`);
  }
  storiesHas(ids: Array<string | number>) {
    const uniq = Array.from(new Set(
      ids
        .map(id => (id ?? '').toString().trim())
        .filter(id => id.length > 0)
    ));
    if (!uniq.length) return this.http.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/stories/has?ids=`);
    const q = encodeURIComponent(uniq.join(','));
    return this.get<{ success: boolean; data: { user_id: string; count: number }[] }>(`${this.svcBase()}/v1/stories/has?ids=${q}`);
  }

  createStory(caption: string, media: Array<{ url: string; kind: string }>) {
    const payload: any = { kind: 'story', visibility: 'public', body: caption || '', media };
    return this.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/posts`, payload);
  }

  // Follow graph
  follow(userId: string) {
    return this.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/users/${userId}/follow`, {});
  }
  unfollow(userId: string) {
    return this.delete<{ success: boolean; message: string }>(`${this.svcBase()}/v1/users/${userId}/follow`);
  }
  removeFollower(userId: string, followerId: string) {
    return this.delete<{ success: boolean; message: string }>(`${this.svcBase()}/v1/users/${userId}/followers/${followerId}`);
  }
  followers(userId: string) {
    return this.get<{ success: boolean; data: string[] }>(`${this.svcBase()}/v1/users/${userId}/followers`);
  }
  following(userId: string) {
    return this.get<{ success: boolean; data: string[] }>(`${this.svcBase()}/v1/users/${userId}/following`);
  }

  // User posts
  userPosts(userId: string, limit = 50) {
    return this.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/users/${userId}/posts?limit=${limit}`);
  }
  postsCount(userId: string) {
    return this.get<{ success: boolean; data: { count: number } }>(`${this.svcBase()}/v1/users/${userId}/posts/count`);
  }

  likePost(id: number) {
    return this.post<{ success: boolean; data: { like_count: number } }>(`${this.svcBase()}/v1/posts/${id}/like`, {});
  }

  unlikePost(id: number) {
    return this.delete<{ success: boolean; data: { like_count: number } }>(`${this.svcBase()}/v1/posts/${id}/like`);
  }

  reactPost(id: number, emoji: string) {
    return this.post<{ success: boolean; data: { reaction_count: number } }>(`${this.svcBase()}/v1/posts/${id}/react`, { emoji });
  }

  unreactPost(id: number, emoji: string) {
    return this.delete<{ success: boolean; data: { reaction_count: number } }>(`${this.svcBase()}/v1/posts/${id}/react?emoji=${encodeURIComponent(emoji)}`);
  }

  viewPost(id: number) {
    return this.post<{ success: boolean; data: { view_count: number } }>(`${this.svcBase()}/v1/posts/${id}/view`, {});
  }

  listComments(postId: number) {
    return this.get<{ success: boolean; data: any[] }>(`${this.svcBase()}/v1/posts/${postId}/comments`);
  }

  createComment(postId: number, body: string, parent_comment_id?: number) {
    const payload: any = { body };
    if (parent_comment_id) payload.parent_comment_id = parent_comment_id;
    return this.post<{ success: boolean; data: any }>(`${this.svcBase()}/v1/posts/${postId}/comments`, payload);
  }

  upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    let h = new HttpHeaders();
    const devUser = localStorage.getItem('devUserId');
    if (devUser) { h = h.set('X-User-UUID', devUser); }
    return this.post<{ success: boolean; data: { url: string; kind: 'image' | 'video' | 'other' } }>(`${this.svcBase()}/v1/uploads`, fd, { headers: h });
  }

  setCommunityMemberRole(communityId: number, userId: string, role: 'admin' | 'member') {
    return this.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/communities/${communityId}/members/${userId}/role`, { role });
  }

  communityBan(communityId: number, userId: string, action: 'ban' | 'unban') {
    return this.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/communities/${communityId}/bans/${userId}`, { action });
  }

  setGroupMemberRole(groupId: number, userId: string, role: 'admin' | 'mod' | 'member') {
    return this.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/groups/${groupId}/members/${userId}/role`, { role });
  }

  groupBan(groupId: number, userId: string, action: 'ban' | 'unban') {
    return this.post<{ success: boolean; message: string }>(`${this.svcBase()}/v1/groups/${groupId}/bans/${userId}`, { action });
  }
}

function escapeHtml(input: string): string {
  return (input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineFormatting(text: string): string {
  let s = text || '';
  // inline code
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  // bold
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // italics
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s;
}

function linkHashtags(text: string): string {
  return (text || '').replace(/(^|\s)#(\w+)/g, (_m, p1, tag) => `${p1}<a href="/explore?tag=${encodeURIComponent(tag)}">#${tag}</a>`);
}

function linkMentions(text: string): string {
  return (text || '').replace(/(^|[^\w])@([a-zA-Z0-9_.]+)/g, (_m, p1, handle) => {
    const safe = encodeURIComponent(handle);
    return `${p1}<a href="/u/${safe}">@${handle}</a>`;
  });
}

function replaceEmojiShortcodes(text: string): string {
  const map: Record<string, string> = {
    ':sparkles:': '✨',
    ':zap:': '⚡',
    ':satellite:': '🛰️',
    ':tools:': '🛠️',
    ':dart:': '🎯',
    ':antenna:': '📡',
    ':earth:': '🌍',
    ':rocket:': '🚀',
  };
  let out = text || '';
  for (const key of Object.keys(map)) {
    out = out.split(key).join(map[key]);
  }
  return out;
}

export function formatPostContent(raw: string): string {
  const escaped = escapeHtml(raw || '');
  const lines = escaped.split(/\r?\n/);
  const html: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) {
      closeLists();
      continue;
    }

    // Blockquote
    if (line.startsWith('&gt;')) {
      closeLists();
      const content = line.replace(/^&gt;\s*/, '');
      html.push(`<blockquote>${applyInlineFormatting(content)}</blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (!inUl) {
        closeLists();
        inUl = true;
        html.push('<ul>');
      }
      html.push(`<li>${applyInlineFormatting(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (!inOl) {
        closeLists();
        inOl = true;
        html.push('<ol>');
      }
      html.push(`<li>${applyInlineFormatting(olMatch[1])}</li>`);
      continue;
    }

    // Paragraph
    closeLists();
    html.push(`<p>${applyInlineFormatting(line)}</p>`);
  }
  closeLists();

  let result = html.join('\n');
  result = replaceEmojiShortcodes(result);
  result = linkMentions(result);
  result = linkHashtags(result);
  return result;
}
