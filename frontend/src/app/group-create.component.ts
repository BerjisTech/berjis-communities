import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { ApiService } from './api.service';
import { catchError, map, of, shareReplay, switchMap } from 'rxjs';

@Component({
  selector: 'app-group-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './group-create.component.html'
})
export class GroupCreateComponent {
  form = this.fb.group({
    name: [''],
    slug: [''],
    description: [''],
    visibility: ['public'],
  });

  state$ = of({ submitting: false, message: '', error: '' }).pipe(shareReplay(1));

  constructor(private fb: FormBuilder, private api: ApiService) {}

  onSubmit() {
    const v = this.form.value;
    const payload = { name: v.name || '', slug: v.slug || '', description: v.description || '', visibility: v.visibility || 'public' };
    this.state$ = of({ submitting: true, message: '', error: '' }).pipe(
      switchMap(() => this.api.createGroup(payload).pipe(
        map(() => ({ submitting: false, message: 'Group created', error: '' })),
        catchError((err) => of({ submitting: false, message: '', error: err?.error?.message || 'Failed to create' }))
      )),
      shareReplay(1)
    );
  }
}

