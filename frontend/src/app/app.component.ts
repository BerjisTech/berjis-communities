import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit, AfterViewInit {
  public isDark = false;
  public navLinks: { name: string, url: string, icon?: string }[] = [
    { name: "Feed", url: "/" },
    { name: "Messages", url: "/messages" },
    { name: "Communities", url: "/communities" },
    { name: "Groups", url: "/groups" },
    { name: "Feed", url: "/" },
    { name: "Settings", url: "/settings" },
  ]

  constructor() {
  }

  ngOnInit() {
    this.navLinks = [
    { name: "Feed", url: "/" },
    { name: "Messages", url: "/messages" },
    { name: "Communities", url: "/communities" },
    { name: "Groups", url: "/groups" },
    { name: "Feed", url: "/" },
    { name: "Settings", url: "/settings" },
  ]
    console.log(this.navLinks)
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

  private applyTheme() {
    const root = document.documentElement;
    if (this.isDark) root.classList.add('dark'); else root.classList.remove('dark');
  }
}
