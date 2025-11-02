import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, linkHashtags } from './api.service';
import { UserAvatarComponent } from './user-avatar.component';

@Component({
  selector: 'app-post-card',
  standalone: true,
  imports: [CommonModule, FormsModule, UserAvatarComponent],
  templateUrl: './post-card.component.html'
})
export class PostCardComponent implements OnChanges {
  @Input() post!: any;
  @Input() users: Record<string, any> = {};
  @Input() depth = 0;
  @Input() emojis: string[] = ['👍', '❤️', '😂', '🎉', '😢'];
  @Output() reloadRequested = new EventEmitter<number>();

  showUserPopover = false;
  moreMenuOpen = false;
  reactionMenuOpen = false;
  commentsOpen = false;
  commentsLoading = false;
  commentsLoaded = false;
  comments: any[] = [];
  commentText = '';
  submittingComment = false;

  viewerOpen = false;
  viewerIndex = 0;
  viewerMedia: any[] = [];

  constructor(private api: ApiService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['post'] && !changes['post'].firstChange) {
      if (this.depth === 0) {
        if (this.post?.children && (this.commentsOpen || this.commentsLoaded)) {
          this.comments = Array.isArray(this.post.children) ? [...this.post.children] : [];
          this.commentsLoaded = true;
        }
      } else {
        this.comments = Array.isArray(this.post?.children) ? this.post.children : [];
      }
    }
  }

  get rootPostId(): number {
    return Number(this.post?.root_post_id ?? this.post?.post_id ?? this.post?.id ?? 0);
  }

  get hasMedia(): boolean {
    return Array.isArray(this.post?.media) && this.post.media.length > 0;
  }

  toggleComments() {
    this.commentsOpen = !this.commentsOpen;
    if (this.commentsOpen) {
      if (this.depth === 0) {
        this.loadComments();
      } else if (!this.commentsLoaded) {
        this.comments = Array.isArray(this.post?.children) ? this.post.children : [];
        this.commentsLoaded = true;
      }
    }
  }

  reloadFromChild(postId: number) {
    if (this.rootPostId && this.rootPostId === postId) {
      this.loadComments(true);
    } else {
      this.reloadRequested.emit(postId);
    }
  }

  loadComments(force = false) {
    if (this.depth > 0) {
      this.comments = Array.isArray(this.post?.children) ? this.post.children : [];
      this.commentsLoaded = true;
      return;
    }
    if (this.commentsLoaded && !force) return;
    if (!this.post?.id) return;
    this.commentsLoading = true;
    this.api.listComments(this.post.id).subscribe({
      next: (response) => {
        const all = Array.isArray(response.data) ? response.data : [];
        const tree = this.buildCommentTree(all);
        this.comments = tree;
        this.commentsLoaded = true;
        this.commentsLoading = false;
        if (this.post) {
          this.post.children = tree;
          this.post.comment_count = all.length;
        }
        this.ensureUserCache(tree);
      },
      error: () => {
        this.commentsLoading = false;
      }
    });
  }

  submitComment() {
    const body = this.commentText.trim();
    if (!body || !this.rootPostId) return;
    const parentCommentId = this.depth > 0 ? this.post?.id : undefined;
    this.submittingComment = true;
    this.api.createComment(this.rootPostId, body, parentCommentId).subscribe({
      next: () => {
        this.commentText = '';
        this.submittingComment = false;
        this.reloadRequested.emit(this.rootPostId);
        if (this.depth === 0) {
          this.loadComments(true);
        }
      },
      error: () => {
        this.submittingComment = false;
      }
    });
  }

  toggleLike() {
    if (!this.post?.id) return;
    const id = this.post.id;
    this.api.likePost(id).subscribe({
      next: (res) => {
        this.post.like_count = res.data?.like_count ?? this.post.like_count;
      },
      error: () => {
        this.api.unlikePost(id).subscribe({
          next: (res) => {
            this.post.like_count = res.data?.like_count ?? this.post.like_count;
          }
        });
      }
    });
  }

  toggleReactionMenu(event: MouseEvent) {
    event.stopPropagation();
    this.reactionMenuOpen = !this.reactionMenuOpen;
  }

  react(emoji: string) {
    if (!this.post?.id) return;
    this.api.reactPost(this.post.id, emoji).subscribe({
      next: (res) => {
        this.post.reaction_count = res.data?.reaction_count ?? this.post.reaction_count;
        this.reactionMenuOpen = false;
      }
    });
  }

  recordView() {
    if (!this.post?.id) return;
    this.api.viewPost(this.post.id).subscribe({
      next: (res) => {
        this.post.view_count = res.data?.view_count ?? this.post.view_count;
      }
    });
  }

  render(content: string): string {
    return linkHashtags(content || '');
  }

  userName(id: any) {
    const u = this.lookupUser(id);
    return u?.username || u?.handle || '';
  }

  fullName(id: any) {
    const u = this.lookupUser(id);
    return u?.full_name || u?.name || '';
  }

  bio(id: any) {
    const u = this.lookupUser(id);
    return u?.bio || '';
  }

  followers(id: any) {
    const u = this.lookupUser(id);
    return u?.followers_count ?? u?.followers ?? 0;
  }

  following(id: any) {
    const u = this.lookupUser(id);
    return u?.following_count ?? u?.following ?? 0;
  }

  postsCount(id: any) {
    const u = this.lookupUser(id);
    return u?.posts_count ?? u?.posts ?? 0;
  }

  avatarUrl(id: any) {
    const u = this.lookupUser(id);
    if (u?.avatarUrl) return u.avatarUrl;
    if (u?.avatar_url) return u.avatar_url;
    if (u?.avatar) return u.avatar;
    const seed = encodeURIComponent(this.normalizeId(id) || 'member');
    return `https://api.dicebear.com/7.x/identicon/svg?seed=${seed}`;
  }

  timeAgo(iso: string): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.max(0, Math.floor((now - then) / 1000));
    const minute = 60;
    const hour = 3600;
    const day = 86400;
    const week = 604800;
    if (diff < minute) return `${diff}s`;
    if (diff < hour) return `${Math.floor(diff / minute)}m`;
    if (diff < day) return `${Math.floor(diff / hour)}h`;
    if (diff < week * 4) return `${Math.floor(diff / day)}d`;
    const date = new Date(then);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd} ${mm}, ${yy}`;
  }

  openViewer() {
    if (!this.hasMedia) return;
    this.viewerMedia = this.post.media || [];
    this.viewerIndex = 0;
    this.viewerOpen = true;
  }

  closeViewer() {
    this.viewerOpen = false;
    this.viewerMedia = [];
    this.viewerIndex = 0;
  }

  nextMedia(event?: Event) {
    event?.stopPropagation();
    if (!this.viewerMedia.length) return;
    this.viewerIndex = (this.viewerIndex + 1) % this.viewerMedia.length;
  }

  prevMedia(event?: Event) {
    event?.stopPropagation();
    if (!this.viewerMedia.length) return;
    this.viewerIndex = (this.viewerIndex - 1 + this.viewerMedia.length) % this.viewerMedia.length;
  }

  private ensureUserCache(nodes: any[]) {
    const ids = new Set<string>();
    const stack = [...nodes];
    while (stack.length) {
      const node = stack.pop();
      if (node?.user_id) {
        const key = this.normalizeId(node.user_id);
        if (key && !this.users[key]) ids.add(key);
      }
      if (Array.isArray(node?.children) && node.children.length) {
        stack.push(...node.children);
      }
    }
    if (!ids.size) return;
    this.api.usersMini(Array.from(ids)).subscribe({
      next: (res) => {
        const arr = Array.isArray(res.data) ? res.data : [];
        for (const u of arr) {
          const key = this.normalizeId(u?.id ?? u?.user_id ?? u?.uuid);
          if (key) {
            this.users[key] = u;
          }
        }
      }
    });
  }

  private buildCommentTree(items: any[]): any[] {
    const map = new Map<number, any>();
    const roots: any[] = [];
    for (const raw of items) {
      if (!raw || raw.id == null) continue;
      const node = { ...raw, children: [] as any[] };
      if (!node.root_post_id) node.root_post_id = this.post?.id ?? node.post_id ?? node.root_post_id;
      if (!node.post_id) node.post_id = node.root_post_id ?? this.post?.id;
      map.set(Number(node.id), node);
    }
    for (const node of map.values()) {
      const parentId = node.parent_comment_id ?? node.parent_id;
      if (parentId && map.has(Number(parentId))) {
        map.get(Number(parentId))!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private lookupUser(id: any): any {
    const key = this.normalizeId(id);
    if (!key) return undefined;
    return this.users[key];
  }

  private normalizeId(value: any): string {
    if (value === null || value === undefined) return '';
    return value.toString().trim();
  }
}
