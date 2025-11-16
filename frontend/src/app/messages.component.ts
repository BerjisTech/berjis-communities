import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest, interval, map, shareReplay, startWith, switchMap, takeUntil, tap } from 'rxjs';
import { ApiService } from './api.service';
import { UserAvatarComponent } from './user-avatar.component';

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, UserAvatarComponent],
  templateUrl: './messages.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessagesComponent implements OnInit, OnDestroy {
  private refreshThreads$ = new BehaviorSubject<void>(undefined);
  private selectUser$ = new BehaviorSubject<string | null>(null);
  private destroy$ = new Subject<void>();

  public messageText = '';
  public sending = false;

  threads$: Observable<any[]>;
  activeUserId$: Observable<string | null>;
  messages$: Observable<any[]>;

  constructor(private api: ApiService) {
    this.threads$ = this.refreshThreads$.pipe(
      switchMap(() => this.api.listMessageThreads()),
      map((res) => res?.data || []),
      shareReplay(1)
    );

    this.activeUserId$ = this.selectUser$.asObservable();

    this.messages$ = combineLatest([this.activeUserId$]).pipe(
      switchMap(([userId]) => {
        if (!userId) {
          return new BehaviorSubject<any[]>([]);
        }
        // Poll for updates every 3 seconds for near-realtime experience
        return interval(3000).pipe(
          startWith(0),
          switchMap(() => this.api.listMessagesWith(userId)),
          map((res) => res?.data || [])
        );
      }),
      shareReplay(1)
    );
  }

  ngOnInit(): void {
    // Initial load
    this.refreshThreads();
    // Auto-select first thread when threads change
    this.threads$
      .pipe(
        takeUntil(this.destroy$),
        tap((threads) => {
          if (!threads.length) return;
          const current = this.selectUser$.value;
          if (!current) {
            this.selectUser$.next(threads[0]?.user_id || threads[0]?.userId || null);
          }
        })
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refreshThreads() {
    this.refreshThreads$.next(undefined);
  }

  selectThread(userId: string) {
    this.selectUser$.next((userId || '').toString());
  }

  async send() {
    const body = (this.messageText || '').trim();
    const userId = this.selectUser$.value;
    if (!body || !userId || this.sending) return;
    this.sending = true;
    this.api.sendMessage(userId, body).subscribe({
      next: () => {
        this.messageText = '';
        this.sending = false;
        this.refreshThreads();
      },
      error: () => {
        this.sending = false;
      }
    });
  }
}

