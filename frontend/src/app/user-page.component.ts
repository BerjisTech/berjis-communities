import { Component } from '@angular/core';

@Component({
  selector: 'app-user-page',
  standalone: true,
  template: `
  <header style="background:#0b5fff;color:#fff;padding:16px 24px"><h1 style="margin:0">User</h1></header>
  <main style="max-width:960px;margin:0 auto;padding:24px">
    <p>User profiles are managed via main account on berjis.test (Core API). This page will fetch from /api when available.</p>
  </main>
  `
})
export class UserPageComponent {}

