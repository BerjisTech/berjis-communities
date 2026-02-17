import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, Subject, combineLatest, interval, map, shareReplay, startWith, switchMap, takeUntil, tap } from 'rxjs';
import { ApiService } from './api.service';
import { UserAvatarComponent } from './user-avatar.component';
import { WsService } from './ws.service';

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

  constructor(private api: ApiService, private ws: WsService, private cdr: ChangeDetectorRef) {
    this.threads$ = this.refreshThreads$.pipe(
      switchMap(() => this.api.listMessageThreads()),
      map((res) => res?.data || []),
      shareReplay(1)
    );

    this.activeUserId$ = this.selectUser$.asObservable();

    // Poll every 10s as fallback; WebSocket events trigger immediate refresh
    this.messages$ = combineLatest([this.activeUserId$]).pipe(
      switchMap(([userId]) => {
        if (!userId) {
          return new BehaviorSubject<any[]>([]);
        }
        return interval(10000).pipe(
          startWith(0),
          switchMap(() => this.api.listMessagesWith(userId)),
          map((res) => res?.data || [])
        );
      }),
      shareReplay(1)
    );
  }

  ngOnInit(): void {
    this.refreshThreads();
    // Auto-select first thread
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

    // Connect WebSocket for real-time messages
    const token = localStorage.getItem('accessToken') || undefined;
    this.ws.connect(token);
    this.ws.events.pipe(takeUntil(this.destroy$)).subscribe((evt) => {
      // When a new message arrives via WS, refresh threads and messages
      this.refreshThreads();
      // Force messages observable to re-fetch for active user
      const current = this.selectUser$.value;
      if (current && (evt.sender_id === current || evt.recipient_id === current)) {
        this.selectUser$.next(current);
      }
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.ws.disconnect();
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

