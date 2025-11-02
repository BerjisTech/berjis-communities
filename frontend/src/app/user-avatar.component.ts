import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ApiService } from './api.service';

@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './user-avatar.component.html',
  styleUrls: ['./user-avatar.component.css']
})
export class UserAvatarComponent implements OnChanges {
  @Input() id: string | number | null = null;
  @Input() src: string | null = null;
  @Input() size = 30; // px
  @Input() alt = 'avatar';

  hasStory = false;

  constructor(private api: ApiService) {}

  ngOnChanges(changes: SimpleChanges) {
    const key = (this.id ?? '').toString().trim();
    if (!key) return;
    this.api.storiesHas([key]).subscribe({
      next: (res) => {
        const arr = res?.data || [];
        const item = arr.find((x: any) => (x?.user_id || '').toString() === key);
        this.hasStory = !!(item && item.count > 0);
      },
      error: () => { this.hasStory = false; }
    });
  }

  get url(): string {
    const candidate = this.src as any;
    const asString = typeof candidate === 'string' ? candidate : (candidate != null ? String(candidate) : '');
    if (asString && asString.trim().length) return asString;
    const seed = encodeURIComponent(String(this.id ?? 'member'));
    return `https://api.dicebear.com/7.x/identicon/svg?seed=${seed}`;
  }
}
