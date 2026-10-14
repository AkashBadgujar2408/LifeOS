import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Project, ProjectsService } from '../../core/services/projects.service';
import { ToastService } from '../../core/services/toast.service';

/** Opens the create/edit dialog; resolves with the saved project, or null if it was dismissed. */
export async function openProjectEditor(
  modal: NgbModal,
  project?: Project,
): Promise<Project | null> {
  const modalRef = modal.open(ProjectEditor, { ariaLabelledBy: 'project-editor-heading' });
  (modalRef.componentInstance as ProjectEditor).configure(project);
  try {
    return (await modalRef.result) as Project;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-project-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './project-editor.html',
})
export class ProjectEditor {
  private readonly fb = inject(FormBuilder);
  private readonly projectsService = inject(ProjectsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly project = signal<Project | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    description: ['', Validators.maxLength(4000)],
  });

  configure(project?: Project): void {
    this.project.set(project ?? null);
    this.form.reset({ name: project?.name ?? '', description: project?.description ?? '' });
  }

  protected fieldError(name: 'name' | 'description'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }

    if (control.errors['required']) {
      return 'Give the project a name.';
    }

    if (control.errors['maxlength']) {
      return name === 'name'
        ? 'Keep the name under 200 characters.'
        : 'Keep the description under 4000 characters.';
    }

    return null;
  }

  protected submit(): void {
    const name = this.form.controls.name;
    name.setValue(name.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = { name: value.name, description: value.description.trim() || null };
    const project = this.project();
    const request = project
      ? this.projectsService.update(project.id, payload)
      : this.projectsService.create(payload);

    this.saving.set(true);
    request.subscribe({
      next: (saved) => this.activeModal.close(saved),
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err.error?.message ?? 'Could not save the project.');
      },
    });
  }
}
