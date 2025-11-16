import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ApiService } from './api.service';

@Component({
  selector: 'app-communities',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './communities.component.html',
})
export class CommunitiesComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('communitiesSentinel', { static: true }) sentinel!: ElementRef<HTMLDivElement>;

  items: any[] = [];
  visible: any[] = [];
  loading = true;
  chunkSize = 9;
  private visibleCount = 0;
  private observer?: IntersectionObserver;

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.listCommunities().subscribe({
      next: (r) => {
        this.items = r.data || [];
        this.loading = false;
        this.loadNextChunk();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  ngAfterViewInit() {
    if (!this.sentinel) return;
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        this.loadNextChunk();
      }
    });
    this.observer.observe(this.sentinel.nativeElement);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }

  private loadNextChunk() {
    if (!this.items.length) return;
    const next = this.items.slice(0, (this.visibleCount += this.chunkSize));
    this.visible = next;
    if (this.visible.length >= this.items.length) {
      this.observer?.disconnect();
    }
  }
}
