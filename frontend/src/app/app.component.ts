import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit, AfterViewInit {
  public isDark = false;
  public navLinks: { name: string, url: string, icon?: string }[] = [
    { name: "Feed", url: "/", icon: "view_day" },
    { name: "Explore", url: "/explore", icon: "explore" },
    { name: "Messages", url: "/messages", icon: "mail" },
    { name: "Communities", url: "/communities", icon: "chat" },
    { name: "Groups", url: "/groups", icon: "group" },
    { name: "Settings", url: "/settings", icon: "settings" },
  ]

  constructor() {
  }

  ngOnInit() { }

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

  private applyTheme() {
    const root = document.documentElement;
    if (this.isDark) root.classList.add('dark'); else root.classList.remove('dark');
  }
}
