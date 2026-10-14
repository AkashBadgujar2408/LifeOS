import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  Injector,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import Swal from 'sweetalert2';
import { Tag, TagsService } from '../../core/services/tags.service';

const TAG_NAME_VALIDATORS = [Validators.required, Validators.maxLength(100)];

@Component({
  selector: 'app-tags',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './tags.html',
})
export class Tags implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly tagsService = inject(TagsService);
  private readonly toastr = inject(ToastrService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly tags = signal<Tag[]>([]);
  protected readonly loading = signal(true);
  protected readonly creating = signal(false);
  protected readonly editingId = signal<number | null>(null);

  protected readonly createForm = this.fb.nonNullable.group({ name: ['', TAG_NAME_VALIDATORS] });
  protected readonly renameForm = this.fb.nonNullable.group({ name: ['', TAG_NAME_VALIDATORS] });

  ngOnInit(): void {
    this.tagsService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tags) => {
          this.tags.set(tags);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.toastr.error('Could not load your tags.');
        },
      });
  }

  protected fieldError(form: 'create' | 'rename'): string | null {
    const control = (form === 'create' ? this.createForm : this.renameForm).controls.name;
    if (!control.touched || !control.errors) {
      return null;
    }

    if (control.errors['required']) {
      return 'Enter a tag name.';
    }

    if (control.errors['maxlength']) {
      return 'Keep tag names under 100 characters.';
    }

    return null;
  }

  protected create(): void {
    this.trimName(this.createForm.controls.name);
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.creating.set(true);
    this.tagsService
      .create(this.createForm.getRawValue().name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tag) => {
          this.creating.set(false);
          this.tags.update((tags) => sortByName([...tags, tag]));
          this.createForm.reset();
          this.toastr.success(`Created "${tag.name}".`);
        },
        error: (err) => {
          this.creating.set(false);
          this.toastr.error(err.error?.message ?? 'Could not create the tag.');
        },
      });
  }

  protected startRename(tag: Tag): void {
    this.editingId.set(tag.id);
    this.renameForm.reset({ name: tag.name });
    afterNextRender(() => document.getElementById('rename-tag-input')?.focus(), {
      injector: this.injector,
    });
  }

  protected cancelRename(): void {
    this.editingId.set(null);
  }

  protected saveRename(tag: Tag): void {
    this.trimName(this.renameForm.controls.name);
    if (this.renameForm.invalid) {
      this.renameForm.markAllAsTouched();
      return;
    }

    const name = this.renameForm.getRawValue().name;
    if (name === tag.name) {
      this.editingId.set(null);
      return;
    }

    this.tagsService
      .rename(tag.id, name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (renamed) => {
          this.tags.update((tags) => sortByName(tags.map((t) => (t.id === tag.id ? renamed : t))));
          this.editingId.set(null);
          this.toastr.success(`Renamed to "${renamed.name}".`);
        },
        error: (err) => this.toastr.error(err.error?.message ?? 'Could not rename the tag.'),
      });
  }

  protected async remove(tag: Tag): Promise<void> {
    const result = await Swal.fire({
      title: `Delete "${tag.name}"?`,
      text: 'It will be removed from everything it was attached to.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete tag',
      confirmButtonColor: '#dc3545',
    });
    if (!result.isConfirmed) {
      return;
    }

    this.tagsService
      .remove(tag.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.tags.update((tags) => tags.filter((t) => t.id !== tag.id));
          this.toastr.success(`Deleted "${tag.name}".`);
        },
        error: (err) => this.toastr.error(err.error?.message ?? 'Could not delete the tag.'),
      });
  }

  private trimName(control: { value: string; setValue: (value: string) => void }): void {
    control.setValue(control.value.trim());
  }
}

function sortByName(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name));
}
