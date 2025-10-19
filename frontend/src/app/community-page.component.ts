import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from './api.service';
import { PostCreateComponent } from './post-create.component';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of, shareReplay, switchMap } from 'rxjs';

@Component({
  selector: 'app-community-page',
  standalone: true,
  imports: [CommonModule, PostCreateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './community-page.component.html'
})
export class CommunityPageComponent {
  vm$ = this.route.paramMap.pipe(
    map(m => m.get('slug') || ''),
    switchMap(slug => this.api.getCommunityBySlug(slug).pipe(
      map(r => ({ loading: false, community: r.data, error: '', message: '' })),
      catchError(() => of({ loading: false, community: null, error: 'Failed to load', message: '' }))
    )),
    shareReplay(1)
  );

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  join(id: number) {
    this.vm$ = this.vm$.pipe(
      switchMap(vm => this.api.joinCommunity(id).pipe(
        map(res => ({ ...vm, message: res.message, error: '' })),
        catchError(err => of({ ...vm, error: err?.error?.message || 'Join failed', message: '' }))
      )),
      shareReplay(1)
    );
  }

  setRole(communityId: number, userId: string | number, role: 'admin' | 'member') {
    const uid = Number(userId || 0);
    if (!uid) { return; }
    this.vm$ = this.vm$.pipe(
      switchMap(vm => this.api.setCommunityMemberRole(communityId, uid, role).pipe(
        map(res => ({ ...vm, message: res.message || 'Role updated', error: '' })),
        catchError(err => of({ ...vm, error: err?.error?.message || 'Update failed', message: '' }))
      )),
      shareReplay(1)
    );
  }

  ban(communityId: number, userId: string | number, action: 'ban' | 'unban') {
    const uid = Number(userId || 0);
    if (!uid) { return; }
    this.vm$ = this.vm$.pipe(
      switchMap(vm => this.api.communityBan(communityId, uid, action).pipe(
        map(res => ({ ...vm, message: res.message || 'OK', error: '' })),
        catchError(err => of({ ...vm, error: err?.error?.message || 'Action failed', message: '' }))
      )),
      shareReplay(1)
    );
  }
}

