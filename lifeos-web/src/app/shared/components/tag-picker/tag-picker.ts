import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgSelectComponent } from '@ng-select/ng-select';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { Tag, TagsService } from '../../../core/services/tags.service';
import { apiErrorMessage } from '../../../core/services/api-error';

let nextId = 0;

/**
 * Tags for an item: a searchable multi-select (Session 75b) — type to find a tag, or to create one ("Create …"). An
 * existing name in any case is picked rather than duplicated. Same inputs/outputs as before, so every editor keeps
 * binding `[selectedTagIds]` / `(selectedTagIdsChange)`.
 */
@Component({
  selector: 'app-tag-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgSelectComponent],
  templateUrl: './tag-picker.html',
})
export class TagPicker implements OnInit {
  private readonly tagsService = inject(TagsService);
  private readonly toast = inject(ToastService);

  readonly selectedTagIds = input<number[]>([]);
  /** Set when a <label for> points at the picker. */
  readonly inputId = input(`tag-picker-${++nextId}`);
  readonly selectedTagIdsChange = output<number[]>();

  protected readonly allTags = signal<Tag[]>([]);

  ngOnInit(): void {
    this.tagsService.list().subscribe({
      next: (tags) => this.allTags.set(tags),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not load tags.')),
    });
  }

  protected changed(ids: number[] | null): void {
    this.selectedTagIdsChange.emit(ids ?? []);
  }

  /**
   * "Create …": a new tag from the server. ng-select only offers it when no tag has that name; should one exist
   * anyway (any case), it's picked instead. A rejection tells ng-select to add nothing.
   */
  protected readonly createTag = async (term: string): Promise<Tag> => {
    const name = term.trim();
    const existing = this.allTags().find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (!name || existing) {
      if (existing && !this.selectedTagIds().includes(existing.id)) {
        this.changed([...this.selectedTagIds(), existing.id]);
      }
      throw new Error('Nothing to create');
    }
    try {
      const tag = await firstValueFrom(this.tagsService.create(name));
      this.allTags.update((tags) => [...tags, tag]);
      return tag;
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'Could not create tag.'));
      throw err;
    }
  };
}
