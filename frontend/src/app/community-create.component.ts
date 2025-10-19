import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { ApiService } from './api.service';
import { catchError, map, of, shareReplay, switchMap } from 'rxjs';

@Component({
  selector: 'app-community-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './community-create.component.html'
})
export class CommunityCreateComponent {
  form = this.fb.group({
    name: [''],
    slug: [''],
    description: [''],
    visibility: ['public'],
    access: ['free'],
    hashtags: [''],
  });

  state$ = of({ submitting: false, message: '', error: '' }).pipe(shareReplay(1));

  constructor(private fb: FormBuilder, private api: ApiService) {}

  onSubmit() {
    const v = this.form.value;
    const tags = (v.hashtags || '').split(',').map(s => s.trim()).filter(Boolean);
    const payload = { name: v.name || '', slug: v.slug || '', description: v.description || '', visibility: v.visibility || 'public', access: v.access || 'free', hashtags: tags };
    this.state$ = of({ submitting: true, message: '', error: '' }).pipe(
      switchMap(() => this.api.createCommunity(payload).pipe(
        map(() => ({ submitting: false, message: 'Community created', error: '' })),
        catchError((err) => of({ submitting: false, message: '', error: err?.error?.message || 'Failed to create' }))
      )),
      shareReplay(1)
    );
  }
}

