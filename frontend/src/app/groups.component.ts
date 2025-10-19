import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from './api.service';

@Component({
  selector: 'app-groups',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './groups.component.html'
})
export class GroupsComponent implements OnInit {
  items: any[] = [];
  loading = true;
  constructor(private api: ApiService) {}
  ngOnInit() {
    this.api.listGroups().subscribe({
      next: (r) => { this.items = r.data; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
}

