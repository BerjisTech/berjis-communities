import { Component, ChangeDetectionStrategy, Input, ViewChild, ElementRef, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { ApiService } from './api.service';
import { BehaviorSubject, Observable, Subject, catchError, debounceTime, distinctUntilChanged, filter, map, of, shareReplay, switchMap } from 'rxjs';

@Component({
  selector: 'app-post-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './post-create.component.html'
})
export class PostCreateComponent {
  @Input() communityId?: number;
  @Input() groupId?: number;
  @ViewChild('bodyArea') bodyArea?: ElementRef<HTMLTextAreaElement>;
  @Output() posted = new EventEmitter<any>();

  form = this.fb.group({
    title: [''],
    body: [''],
    visibility: ['public'],
  });

  private submit$?: ReturnType<ApiService['createPostGeneric']>;

  state$ = of({ submitting: false, message: '', error: '' }).pipe(shareReplay(1));

  private bodyChange$ = new Subject<string>();
  suggest$: Observable<{ name: string; count: number }[]> = this.bodyChange$.pipe(
    map(v => this.currentTagQuery(v)),
    filter(q => q.length >= 1),
    debounceTime(150),
    distinctUntilChanged(),
    switchMap(q => this.api.tagsSuggest(q).pipe(
      map(r => r.data || []),
      catchError(() => of([]))
    )),
    shareReplay(1)
  );

  constructor(private fb: FormBuilder, private api: ApiService) {}

  onBodyInput(ev: Event) {
    const val = (ev.target as HTMLTextAreaElement).value;
    this.bodyChange$.next(val);
  }

  private currentTagQuery(text: string): string {
    // Get word at cursor starting with '#'
    const el = this.bodyArea?.nativeElement;
    const pos = el ? el.selectionStart || text.length : text.length;
    const left = text.slice(0, pos);
    const match = left.match(/(^|\s)#([\w-]{1,32})$/);
    return (match && match.length > 0) ? match[2] : '';
  }

  insertTag(tag: string) {
    const el = this.bodyArea?.nativeElement;
    const text = this.form.value.body || '';
    if (!el) { this.form.patchValue({ body: `${text} #${tag}`.trim() }); return; }
    const pos = el.selectionStart || text.length;
    const start = text.slice(0, pos);
    const end = text.slice(pos);
    const replaced = start.replace(/#([\w-]{0,32})$/, `#${tag}`);
    const next = replaced + end;
    this.form.patchValue({ body: next });
    // Move cursor to after inserted tag
    queueMicrotask(() => {
      const npos = replaced.length;
      el.setSelectionRange(npos, npos);
      el.focus();
    });
  }

  onSubmit() {
    const v = this.form.value;
    // Extract hashtags from body content
    const body = v.body || '';
    const tags = Array.from(new Set((body.match(/(^|\s)#([\w-]+)/g) || []).map(s => s.trim().replace(/^#/, '').toLowerCase())));
    const payload: any = { title: v.title || '', body, hashtags: tags };
    if (this.uploads.length) { payload.media = this.uploads; }
    if (this.communityId) payload.community_id = this.communityId;
    if (this.groupId) payload.group_id = this.groupId;
    if (!this.communityId && !this.groupId) payload.visibility = (v.visibility as any) || 'public';

    this.state$ = of({ submitting: true, message: '', error: '' }).pipe(
      switchMap(() => this.api.createPostGeneric(payload).pipe(
        map((res) => {
          // Optimistically inject a post at top of feed
          const id = (res as any)?.data?.id || 0;
          const now = new Date().toISOString();
          const me = this.api['meCache']?.data || {};
          const user_id = (me?.id || me?.uuid || '').toString();
          const newPost: any = {
            id,
            title: payload.title || '',
            body: payload.body || '',
            user_id,
            kind: payload.kind || 'post',
            created_at: now,
            community_id: payload.community_id || null,
            group_id: payload.group_id || null,
            like_count: 0,
            reaction_count: 0,
            comment_count: 0,
            media: payload.media || []
          };
          this.posted.emit(newPost);
          // Clear form/uploads
          this.form.reset({ title: '', body: '', visibility: this.communityId || this.groupId ? 'public' : 'public' });
          this.uploads = [];
          return ({ submitting: false, message: 'Posted successfully', error: '' });
        }),
        catchError((err) => of({ submitting: false, message: '', error: err?.error?.message || 'Failed to post' }))
      )),
      shareReplay(1)
    );
  }

  // Upload support
  uploads: { url: string; kind: 'image'|'video'|'other' }[] = [];
  pickFiles(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input.files?.length) return;
    Array.from(input.files).forEach((f) => {
      this.api.upload(f).subscribe({
        next: (r) => { if (r?.data?.url) this.uploads.push({ url: r.data.url, kind: (r.data.kind as any) || 'image' }); },
        error: () => {}
      });
    });
  }
  removeUpload(i: number) { this.uploads.splice(i, 1); }
}
