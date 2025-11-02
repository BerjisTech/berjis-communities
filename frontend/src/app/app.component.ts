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
      const uid = (me?.id || me?.uuid || '').toString();
      if (uid) {
        this.api.usersMini([uid]).subscribe({
          next: (res) => {
            const arr = (res as any)?.data || res || [];
            this.miniForMe = Array.isArray(arr) && arr.length ? arr[0] : null;
          }
        });
      }
      if (me && (me.id || me.uuid)) {
        const uid = (me.id || me.uuid).toString();
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
