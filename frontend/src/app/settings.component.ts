import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ApiService } from './api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit {
  saving = false;
  message = '';
  error = '';

  form = this.fb.group({
    communities_handle: [''],
    default_visibility: ['public'],
    filtered_words: [''],
    filtered_phrases: [''],
    blocked_user_ids: [''],
    dm_policy: ['anyone'],
    monetization_enabled: [false],
    allow_paid_only_posts: [false],
    allow_subscriber_only_posts: [false]
  });

  visibilityOptions = [
    { value: 'public', label: 'Public' },
    { value: 'private', label: 'Private' },
    { value: 'followers', label: 'Followers only' },
    { value: 'subscribers', label: 'Subscribers only (future)' },
    { value: 'paid', label: 'Paid one-off (pay-per-post)' }
  ];

  dmOptions = [
    { value: 'anyone', label: 'Anyone can message me' },
    { value: 'followers', label: 'Only people I follow' },
    { value: 'none', label: 'No direct messages' }
  ];

  constructor(private fb: FormBuilder, private api: ApiService) {}

  ngOnInit(): void {
    this.api.getPreferences().subscribe({
      next: (res) => {
        const prefs = (res as any)?.data || {};
        this.form.patchValue({
          communities_handle: prefs.communities_handle || '',
          default_visibility: prefs.default_visibility || 'public',
          filtered_words: (prefs.filtered_words || []).join(', '),
          filtered_phrases: (prefs.filtered_phrases || []).join(' | '),
          blocked_user_ids: (prefs.blocked_user_ids || []).join(', '),
          dm_policy: prefs.dm_policy || 'anyone',
          monetization_enabled: !!prefs.monetization_enabled,
          allow_paid_only_posts: !!prefs.allow_paid_only_posts,
          allow_subscriber_only_posts: !!prefs.allow_subscriber_only_posts
        });
      },
      error: () => {}
    });
  }

  save() {
    if (this.saving) return;
    this.saving = true;
    this.message = '';
    this.error = '';
    const v = this.form.value;
    const payload: any = {
      communities_handle: (v.communities_handle || '').trim() || null,
      default_visibility: v.default_visibility,
      filtered_words: String(v.filtered_words || '')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => !!x),
      filtered_phrases: String(v.filtered_phrases || '')
        .split('|')
        .map((x) => x.trim())
        .filter((x) => !!x),
      blocked_user_ids: String(v.blocked_user_ids || '')
        .split(',')
        .map((x) => x.trim())
        .filter((x) => !!x),
      dm_policy: v.dm_policy,
      monetization_enabled: !!v.monetization_enabled,
      allow_paid_only_posts: !!v.allow_paid_only_posts,
      allow_subscriber_only_posts: !!v.allow_subscriber_only_posts
    };
    this.api.updatePreferences(payload).subscribe({
      next: () => {
        this.saving = false;
        this.message = 'Preferences saved.';
      },
      error: (err) => {
        this.saving = false;
        this.error = err?.error?.message || 'Unable to save settings.';
      }
    });
  }
}

