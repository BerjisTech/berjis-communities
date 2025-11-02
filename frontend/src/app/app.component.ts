import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService } from './api.service';
import { StoryStripComponent } from './story-strip.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, StoryStripComponent],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit, AfterViewInit {
  public isDark = false;
  public currentUser: any | null = null;
  public userLoading = true;
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
    if (!this.currentUser) {
      return this.placeholderAvatar('guest');
    }
    return (
      this.currentUser.avatarUrl ||
      this.currentUser.avatar_url ||
      this.currentUser.avatar ||
      this.placeholderAvatar(this.currentUser.id || this.currentUser.uuid || this.userDisplayName)
    );
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
}
