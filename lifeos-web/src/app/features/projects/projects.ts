import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { isOverdue } from '../../core/dates/today';
import {
  PROJECT_STATUSES,
  Project,
  ProjectStatus,
  ProjectsService,
} from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';
import { openProjectEditor } from './project-editor';

@Component({
  selector: 'app-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink],
  templateUrl: './projects.html',
})
export class Projects implements OnInit {
  private readonly projectsService = inject(ProjectsService);
  private readonly toast = inject(ToastService);
  private readonly modal = inject(NgbModal);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly statuses = PROJECT_STATUSES;
  protected readonly isOverdue = isOverdue;

  protected readonly projects = signal<Project[]>([]);
  protected readonly loading = signal(true);
  protected readonly statusFilter = signal<ProjectStatus>('Active');

  protected readonly statusCounts = computed(() => {
    const counts = new Map<ProjectStatus, number>();
    for (const project of this.projects()) {
      counts.set(project.status, (counts.get(project.status) ?? 0) + 1);
    }
    return counts;
  });

  protected readonly visibleProjects = computed(() =>
    this.projects().filter((p) => p.status === this.statusFilter()),
  );

  ngOnInit(): void {
    this.projectsService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projects) => {
          this.projects.set(projects);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toast.error('Could not load your projects.');
        },
      });
  }

  protected async newProject(): Promise<void> {
    const project = await openProjectEditor(this.modal);
    if (project) {
      this.toast.success('Project created.');
      void this.router.navigate(['/projects', project.id]);
    }
  }
}
