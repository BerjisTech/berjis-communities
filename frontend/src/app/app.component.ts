import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from './api.service';
import { StoryStripComponent } from './story-strip.component';
import { UserAvatarComponent } from './user-avatar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, StoryStripComponent, UserAvatarComponent],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit, AfterViewInit {
  public isDark = false;
  public currentUser: any | null = null;
  public userLoading = true;
  public followerCount = 0;
  public followingCount = 0;
  public postsCount = 0;
  public followers: string[] = [];
  public following: string[] = [];
  public followingSet = new Set<string>();
  public usersMini: Record<string, any> = {};
  public showFollowers = false;
  public showFollowing = false;
  private miniForMe: any | null = null;

  // Right sidebar data
  public suggestedTags: { tag: string; count: number }[] = [];
  public suggestedPosts: any[] = [];
  public recommendedUserIds: string[] = [];
  public loadingSuggestions = false;

  public navLinks: { name: string, url: string, icon?: string }[] = [
    { name: "Feed", url: "/", icon: "view_day" },
    { name: "Explore", url: "/explore", icon: "explore" },
    { name: "Messages", url: "/messages", icon: "mail" },
    { name: "Communities", url: "/communities", icon: "chat" },
    { name: "Groups", url: "/groups", icon: "group" },
    { name: "Settings", url: "/settings", icon: "settings" },
  ]

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadCurrentUser();
    this.loadSuggestionsAndRecommendations();
  }

  ngAfterViewInit() {
    const stored = localStorage.getItem('theme');
    this.isDark = stored === 'dark';
    this.applyTheme();
  }

  toggleTheme() {
    this.isDark = !this.isDark;
    localStorage.setItem('theme', this.isDark ? 'dark' : 'light');
    this.applyTheme();
  }

  get userDisplayName(): string {
    if (!this.currentUser) return 'Guest';
    return (
      this.currentUser.name ||
      this.currentUser.full_name ||
      this.currentUser.username ||
      this.currentUser.handle ||
      (this.currentUser.email ? this.currentUser.email.split('@')[0] : 'Member')
    );
  }

  get userHandle(): string {
    if (!this.currentUser) return '';
    const handle = this.currentUser.username || this.currentUser.handle;
    if (handle) return '@' + handle;
    if (this.currentUser.email) return '@' + this.currentUser.email.split('@')[0];
    return '';
  }

  get userAvatar(): string {
    const src = (
      this.miniForMe?.avatarUrl || this.miniForMe?.avatar_url || this.miniForMe?.avatar ||
      this.currentUser?.avatarUrl || this.currentUser?.avatar_url || this.currentUser?.avatar
    );
    if (src && String(src).trim().length) return src;
    return this.placeholderAvatar(this.currentUser?.id || this.currentUser?.uuid || this.userDisplayName || 'guest');
  }

  private applyTheme() {
    const root = document.documentElement;
    if (this.isDark) root.classList.add('dark'); else root.classList.remove('dark');
  }

  private async loadCurrentUser() {
    this.userLoading = true;
    try {
      const me = await this.api.currentUser();
      this.currentUser = me;
      // Pull a unified mini profile for consistent avatar fields
      const uid = (me?.uuid || me?.id || '').toString();
      if (uid) {
        this.api.usersMini([uid]).subscribe({
          next: (res) => {
            const arr = (res as any)?.data || res || [];
            this.miniForMe = Array.isArray(arr) && arr.length ? arr[0] : null;
          }
        });
      }
      if (me && (me.uuid || me.id)) {
        const uid = (me.uuid || me.id).toString();
        // Load counts and lists
        this.api.followers(uid).subscribe(res => {
          this.followers = res.data || [];
          this.followerCount = this.followers.length;
          this.fetchUsersMini(this.followers);
        });
        this.api.following(uid).subscribe(res => {
          this.following = res.data || [];
          this.followingSet = new Set(this.following);
          this.followingCount = this.following.length;
          this.fetchUsersMini(this.following);
        });
        this.api.postsCount(uid).subscribe(res => {
          this.postsCount = res?.data?.count ?? 0;
        });
      }
    } catch {
      this.currentUser = null;
    } finally {
      this.userLoading = false;
    }
  }

  private loadSuggestionsAndRecommendations() {
    this.loadingSuggestions = true;
    this.api.feedPublic(100, { }).subscribe({
      next: (response) => {
        const items = (response as any)?.data || [];
        this.buildSuggestedTags(items);
        this.buildSuggestedPosts(items);
        this.buildRecommendedUsers(items);
        this.loadingSuggestions = false;
      },
      error: () => {
        this.loadingSuggestions = false;
      }
    });
  }

  private buildSuggestedTags(items: any[]) {
    const tagCounts = new Map<string, number>();
    for (const item of (items || [])) {
      const body = String(item?.body || '');
      const matches = body.match(/(^|\s)#([\w-]+)/g) || [];
      for (const raw of matches) {
        const cleaned = raw.replace(/^[^\#]*#/, '').trim().toLowerCase();
        if (!cleaned) continue;
        tagCounts.set(cleaned, (tagCounts.get(cleaned) || 0) + 1);
      }
    }
    const sorted = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));
    this.suggestedTags = sorted;
  }

  private buildSuggestedPosts(items: any[]) {
    const unique: any[] = [];
    const seen = new Set<number>();
    for (const item of (items || [])) {
      const id = Number(item?.id || 0);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      unique.push(item);
      if (unique.length >= 5) break;
    }
    this.suggestedPosts = unique;
  }

  private buildRecommendedUsers(items: any[]) {
    const meId = (this.currentUser?.uuid || this.currentUser?.id || '').toString();
    const ids: string[] = [];
    const seen = new Set<string>();
    for (const item of (items || [])) {
      const raw = (item?.user_id ?? '').toString().trim();
      if (!raw) continue;
      if (meId && raw === meId) continue;
      if (this.followingSet.has(raw)) continue;
      if (seen.has(raw)) continue;
      seen.add(raw);
      ids.push(raw);
      if (ids.length >= 5) break;
    }
    this.recommendedUserIds = ids;
    if (ids.length) {
      this.fetchUsersMini(ids);
    }
  }

  private placeholderAvatar(seed: string): string {
    const value = encodeURIComponent(String(seed || 'member'));
    return `https://api.dicebear.com/7.x/identicon/svg?seed=${value}`;
  }

  // Followers modal helpers
  openFollowers() { this.showFollowers = true; this.showFollowing = false; }
  openFollowing() { this.showFollowing = true; this.showFollowers = false; }
  closeModals() { this.showFollowers = false; this.showFollowing = false; }

  isFollowing(id: string): boolean { return this.followingSet.has((id || '').toString()); }

  toggleFollow(id: string) {
    const uid = (id || '').toString();
    if (!uid) return;
    if (this.isFollowing(uid)) {
      this.api.unfollow(uid).subscribe(() => {
        this.followingSet.delete(uid);
        this.following = this.following.filter(x => x !== uid);
        this.followingCount = this.following.length;
      });
    } else {
      this.api.follow(uid).subscribe(() => {
        this.followingSet.add(uid);
        if (!this.following.includes(uid)) this.following.push(uid);
        this.followingCount = this.following.length;
      });
    }
  }

  removeFollower(id: string) {
    const me = (this.currentUser?.id || this.currentUser?.uuid || '').toString();
    const uid = (id || '').toString();
    if (!me || !uid) return;
    this.api.removeFollower(me, uid).subscribe(() => {
      this.followers = this.followers.filter(x => x !== uid);
      this.followerCount = this.followers.length;
    });
  }

  userMini(id: string) { return this.usersMini[(id || '').toString()]; }
  userName(id: string) {
    const u = this.userMini(id);
    return u?.name || u?.full_name || u?.username || u?.handle || (u?.email ? u.email.split('@')[0] : 'User');
  }

  userHandleForId(id: string): string {
    const u = this.userMini(id);
    const handle = u?.username || u?.handle;
    if (handle && String(handle).trim().length) return String(handle);
    if (u?.email) {
      return String(u.email).split('@')[0];
    }
    return '';
  }

  userAvatarById(id: string) {
    const u = this.userMini(id);
    if (u?.avatarUrl) return u.avatarUrl;
    if (u?.avatar_url) return u.avatar_url;
    if (u?.avatar) return u.avatar;
    return this.placeholderAvatar(id);
  }
  private fetchUsersMini(ids: string[]) {
    const uniq = Array.from(new Set((ids || []).map(x => (x || '').toString()).filter(Boolean)));
    if (!uniq.length) return;
    this.api.usersMini(uniq).subscribe(res => {
      const arr = (res as any)?.data || res;
      for (const u of (arr || [])) {
        const key = (u?.id ?? u?.uuid ?? '').toString();
        if (key) this.usersMini[key] = u;
      }
    });
  }
}
