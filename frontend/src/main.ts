import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Routes } from '@angular/router';
import { AppComponent } from './app/app.component';
import { provideHttpClient } from '@angular/common/http';
import { HomeComponent } from './app/home.component';
import { ExploreComponent } from './app/explore.component';
import { CommunitiesComponent } from './app/communities.component';
import { GroupsComponent } from './app/groups.component';
import { GroupPageComponent } from './app/group-page.component';
import { CommunityPageComponent } from './app/community-page.component';
import { UserPageComponent } from './app/user-page.component';
import { PostCreateComponent } from './app/post-create.component';
import { CommunityCreateComponent } from './app/community-create.component';
import { GroupCreateComponent } from './app/group-create.component';
import { UserPostsComponent } from './app/user-posts.component';
import { UserPublicPostsComponent } from './app/user-public-posts.component';
import { MessagesComponent } from './app/messages.component';
import { SettingsComponent } from './app/settings.component';
import { CORE_AUTH_API_BASE, createAuthGuard } from '@berjis/angular-auth';
import { environment } from './environments/environment';

const authGuard = createAuthGuard({
  ensureOptions: { maxAgeMs: 1500 }
});

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'explore', component: ExploreComponent },
  { path: 'communities', component: CommunitiesComponent },
  { path: 'communities/new', component: CommunityCreateComponent, canActivate: [authGuard] },
  { path: 'groups', component: GroupsComponent },
  { path: 'groups/new', component: GroupCreateComponent, canActivate: [authGuard] },
  { path: 'g/:slug', component: GroupPageComponent },
  { path: 'c/:slug', component: CommunityPageComponent },
  { path: 'u/:username', component: UserPageComponent },
  { path: 'u/:username/posts', component: UserPublicPostsComponent },
  { path: 'me/posts', component: UserPostsComponent, canActivate: [authGuard] },
  { path: 'create', component: PostCreateComponent, canActivate: [authGuard] },
  { path: 'messages', component: MessagesComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
];

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    { provide: CORE_AUTH_API_BASE, useValue: environment.apiBase }
  ]
}).catch(err => console.error(err));
