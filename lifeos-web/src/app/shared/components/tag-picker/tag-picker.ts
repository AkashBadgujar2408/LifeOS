import { ChangeDetectionStrategy, Component, inject, input, output, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Tag, TagsService } from '../../../core/services/tags.service';

@Component({
  selector: 'app-tag-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './tag-picker.html',
})
export class TagPicker implements OnInit {
  private readonly tagsService = inject(TagsService);
  private readonly toastr = inject(ToastrService);

  readonly selectedTagIds = input<number[]>([]);
  readonly selectedTagIdsChange = output<number[]>();

  protected readonly allTags = signal<Tag[]>([]);
  protected readonly newTagName = signal('');

  protected readonly selectedTags = computed(() =>
    this.allTags().filter((tag) => this.selectedTagIds().includes(tag.id)),
  );

  protected readonly unselectedTags = computed(() =>
    this.allTags().filter((tag) => !this.selectedTagIds().includes(tag.id)),
  );

  ngOnInit(): void {
    this.tagsService.list().subscribe({
      next: (tags) => this.allTags.set(tags),
      error: () => this.toastr.error('Could not load tags.'),
    });
  }

  selectTag(tag: Tag): void {
    this.selectedTagIdsChange.emit([...this.selectedTagIds(), tag.id]);
  }

  removeTag(tagId: number): void {
    this.selectedTagIdsChange.emit(this.selectedTagIds().filter((id) => id !== tagId));
  }

  addNewTag(): void {
    const name = this.newTagName().trim();
    if (!name) {
      return;
    }

    const existing = this.allTags().find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      this.selectTag(existing);
      this.newTagName.set('');
      return;
    }

    this.tagsService.create(name).subscribe({
      next: (tag) => {
        this.allTags.set([...this.allTags(), tag]);
        this.selectTag(tag);
        this.newTagName.set('');
      },
      error: (err) => this.toastr.error(err.error?.message ?? 'Could not create tag.'),
    });
  }
}
