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
import { ToastService } from '../../core/services/toast.service';
import Swal from 'sweetalert2';
import { Tag, TagsService } from '../../core/services/tags.service';
import { apiErrorMessage } from '../../core/services/api-error';
import { LoadError } from '../../shared/components/load-error/load-error';

const TAG_NAME_VALIDATORS = [Validators.required, Validators.maxLength(100)];

@Component({
  selector: 'app-tags',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoadError, ReactiveFormsModule],
  templateUrl: './tags.html',
})
export class Tags implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly tagsService = inject(TagsService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly tags = signal<Tag[]>([]);
  protected readonly loading = signal(true);
  /** The last load failed: show the retry block, not the empty state (which would say "you have none"). */
  protected readonly loadFailed = signal(false);
  protected readonly creating = signal(false);
  protected readonly editingId = signal<number | null>(null);

  protected readonly createForm = this.fb.nonNullable.group({ name: ['', TAG_NAME_VALIDATORS] });
  protected readonly renameForm = this.fb.nonNullable.group({ name: ['', TAG_NAME_VALIDATORS] });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.tagsService
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tags) => {
          this.tags.set(tags);
          this.loading.set(false);
          this.loadFailed.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadFailed.set(true);
          this.toast.error(apiErrorMessage(err, 'Could not load your tags.'));
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
          this.toast.success(`Created "${tag.name}".`);
        },
        error: (err) => {
          this.creating.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not create the tag.'));
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
          this.toast.success(`Renamed to "${renamed.name}".`);
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not rename the tag.')),
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
          this.toast.success(`Deleted "${tag.name}".`);
        },
        error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the tag.')),
      });
  }

  private trimName(control: { value: string; setValue: (value: string) => void }): void {
    control.setValue(control.value.trim());
  }
}

function sortByName(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name));
}
