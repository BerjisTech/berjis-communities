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

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'explore', component: ExploreComponent },
  { path: 'communities', component: CommunitiesComponent },
  { path: 'groups', component: GroupsComponent },
  { path: 'g/:slug', component: GroupPageComponent },
  { path: 'c/:slug', component: CommunityPageComponent },
  { path: 'u/:username', component: UserPageComponent },
];

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideHttpClient()]
}).catch(err => console.error(err));
