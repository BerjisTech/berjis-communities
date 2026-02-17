import { Injectable } from '@angular/core';
import { Observable, Subject, timer } from 'rxjs';
import { retryWhen, tap, delayWhen } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class WsService {
  private socket: WebSocket | null = null;
  private messages$ = new Subject<any>();
  private reconnectAttempts = 0;
  private maxReconnect = 10;
  private destroyed = false;

  get events(): Observable<any> {
    return this.messages$.asObservable();
  }

  connect(token?: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    this.destroyed = false;

    const base = this.wsBase();
    const url = token ? `${base}/v1/messages/ws?token=${encodeURIComponent(token)}` : `${base}/v1/messages/ws`;

    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        this.messages$.next(data);
      } catch {}
    };

    this.socket.onclose = () => {
      if (!this.destroyed && this.reconnectAttempts < this.maxReconnect) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        setTimeout(() => this.connect(token), delay);
      }
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  disconnect(): void {
    this.destroyed = true;
    this.socket?.close();
    this.socket = null;
  }

  private wsBase(): string {
    const w: any = (typeof window !== 'undefined') ? (window as any) : {};
    const httpBase: string = w.__COMMUNITIES_API__ || 'https://communities-api.berjis.tech';
    return httpBase.replace(/^http/, 'ws');
  }
}
