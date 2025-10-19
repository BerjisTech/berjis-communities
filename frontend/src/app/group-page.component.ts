import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from './api.service';
import { PostCreateComponent } from './post-create.component';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of, shareReplay, switchMap } from 'rxjs';

@Component({
  selector: 'app-group-page',
  standalone: true,
  imports: [CommonModule, PostCreateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './group-page.component.html'
})
export class GroupPageComponent {
  vm$ = this.route.paramMap.pipe(
    map(m => m.get('slug') || ''),
    switchMap(slug => this.api.getGroupBySlug(slug).pipe(
      map(r => ({ loading: false, group: r.data, error: '', message: '' })),
      catchError(() => of({ loading: false, group: null, error: 'Failed to load', message: '' }))
    )),
    shareReplay(1)
  );

  constructor(private api: ApiService, private route: ActivatedRoute) {}

  join(id: number) {
    this.vm$ = this.vm$.pipe(
      switchMap(vm => this.api.joinGroup(id).pipe(
        map(res => ({ ...vm, message: res.message, error: '' })),
        catchError(err => of({ ...vm, error: err?.error?.message || 'Join failed', message: '' }))
      )),
      shareReplay(1)
    );
  }
}

