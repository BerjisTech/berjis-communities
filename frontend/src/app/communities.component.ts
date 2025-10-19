import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from './api.service';

@Component({
  selector: 'app-communities',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './communities.component.html'
})
export class CommunitiesComponent implements OnInit {
  items: any[] = [];
  loading = true;
  constructor(private api: ApiService) {}
  ngOnInit() {
    this.api.listCommunities().subscribe({
      next: (r) => { this.items = r.data; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
}

