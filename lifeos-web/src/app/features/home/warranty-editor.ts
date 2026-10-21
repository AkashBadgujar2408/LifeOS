import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { browserTimeZone } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { ContactsService } from '../../core/services/contacts.service';
import {
  HomeService,
  HomeTargetType,
  WARRANTY_KINDS,
  Warranty,
  WarrantyKind,
} from '../../core/services/home.service';
import { SettingsService } from '../../core/services/settings.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { WARRANTY_KIND_LABELS } from './home-view';

export type WarrantyEditorResult = { kind: 'saved'; warranty: Warranty } | { kind: 'deleted' };

/** Opens a warranty (new when missing, optionally on a given item); resolves with what happened, or null. */
export async function openWarrantyEditor(
  modal: NgbModal,
  warranty?: Warranty,
  cover?: { type: HomeTargetType; id: number },
): Promise<WarrantyEditorResult | null> {
  const modalRef = modal.open(WarrantyEditor, {
    ariaLabelledBy: 'warranty-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as WarrantyEditor).configure(warranty, cover);
  try {
    return (await modalRef.result) as WarrantyEditorResult;
  } catch {
    return null;
  }
}

/** "Asset:5" — what the cover select holds, so one box can choose among belongings, vehicles and properties. */
const coverKey = (type: HomeTargetType, id: number) => `${type}:${id}`;

/**
 * A warranty, extended warranty or AMC on one belonging, vehicle or property: when it runs out (reminded N days
 * before, kept by the server), who to call, what it cost — and, once saved, the warranty card linked.
 */
@Component({
  selector: 'app-warranty-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="warranty-editor-heading" class="modal-title h5">
          {{ warranty() ? 'Edit cover' : 'Add a warranty or AMC' }}
        </h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div class="row g-3">
          <div class="col-sm-7">
            <label class="form-label" for="warranty-cover">Covers</label>
            <ng-select
              labelForId="warranty-cover"
              [class.is-invalid]="fieldError('cover')"
              formControlName="cover"
              placeholder="Pick what it covers"
              [clearable]="false"
            >
              @if (assets().length) {
                <optgroup label="Belongings">
                  @for (a of assets(); track a.id) {
                    <ng-option [value]="key('Asset', a.id)">
                      {{ a.name }}{{ a.room ? ' (' + a.room + ')' : '' }}
                    </ng-option>
                  }
                </optgroup>
              }
              @if (vehicles().length) {
                <optgroup label="Vehicles">
                  @for (v of vehicles(); track v.id) {
                    <ng-option [value]="key('Vehicle', v.id)">
                      {{ v.name }}
                    </ng-option>
                  }
                </optgroup>
              }
              @if (properties().length) {
                <optgroup label="Properties">
                  @for (p of properties(); track p.id) {
                    <ng-option [value]="key('Property', p.id)">
                      {{ p.name }}
                    </ng-option>
                  }
                </optgroup>
              }
            </ng-select>
            @if (fieldError('cover'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-5">
            <label class="form-label" for="warranty-kind">Kind</label>
            <select id="warranty-kind" class="form-select" formControlName="kind">
              @for (kind of kinds; track kind) {
                <option [ngValue]="kind" [selected]="kind === form.controls.kind.value">
                  {{ kindLabels[kind] }}
                </option>
              }
            </select>
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="warranty-provider">
              Given by <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="warranty-provider"
              type="text"
              class="form-control"
              formControlName="provider"
              placeholder="e.g. LG, Croma, Urban Company"
              autocomplete="off"
            />
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="warranty-contact">
              Service centre <span class="text-body-secondary small">(a contact)</span>
            </label>
            <ng-select
              labelForId="warranty-contact"
              formControlName="contactId"
              placeholder="Pick a contact (optional)"
            >
              @for (c of contacts(); track c.id) {
                <ng-option [value]="c.id">
                  {{ c.name }}
                </ng-option>
              }
            </ng-select>
          </div>
        </div>
        <div class="row g-3">
          @for (d of dateFields; track d.name) {
            <div class="col-sm-6">
              <label class="form-label" [for]="'warranty-' + d.name">{{ d.label }}</label>
              <div class="input-group">
                <input
                  [id]="'warranty-' + d.name"
                  type="text"
                  class="form-control"
                  [class.is-invalid]="fieldError(d.name)"
                  [formControlName]="d.name"
                  [placeholder]="d.placeholder"
                  autocomplete="off"
                  ngbDatepicker
                  #picker="ngbDatepicker"
                  [minDate]="minDate"
                  [maxDate]="maxDate"
                  container="body"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  [attr.aria-label]="'Pick ' + d.label.toLowerCase()"
                  (click)="picker.toggle()"
                >
                  <i class="bi bi-calendar3"></i>
                </button>
              </div>
              @if (fieldError(d.name); as error) {
                <div class="invalid-feedback d-block">{{ error }}</div>
              }
            </div>
          }
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <div class="form-check mb-0">
            <input
              id="warranty-remind"
              type="checkbox"
              class="form-check-input"
              formControlName="remind"
            />
            <label class="form-check-label" for="warranty-remind">Remind me</label>
          </div>
          <input
            type="number"
            min="0"
            max="365"
            class="form-control form-control-sm"
            style="width: 5.5rem"
            [class.is-invalid]="fieldError('reminderDays')"
            formControlName="reminderDays"
            placeholder="30"
            aria-label="Days before it runs out"
          />
          <span class="small">days before it runs out</span>
          @if (fieldError('reminderDays'); as error) {
            <div class="invalid-feedback d-block w-100">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="warranty-cost">
              It cost <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="warranty-cost"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('cost')"
              formControlName="cost"
              placeholder="e.g. 2500"
            />
            @if (fieldError('cost'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="warranty-currency">Currency</label>
            <ng-select
              labelForId="warranty-currency"
              [class.is-invalid]="fieldError('currency')"
              formControlName="currency"
              placeholder="Choose a currency"
            >
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code"> {{ c.code }} — {{ c.name }} </ng-option>
              }
            </ng-select>
            @if (fieldError('currency'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div>
          <label class="form-label" for="warranty-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="warranty-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="What's covered, visits included, the claim number to call"
          ></textarea>
        </div>
        @if (warranty(); as w) {
          <div class="border-top pt-3">
            <p class="small text-body-secondary mb-2">
              Link the warranty card or AMC contract (from Documents).
            </p>
            <app-linked-items entityType="Warranty" [entityId]="w.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="Warranty"
              [entityId]="w.id"
              [entityTitle]="w.coverName + ' — ' + kindLabels[w.kind].toLowerCase()"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (warranty()) {
          <button type="button" class="btn btn-outline-danger me-auto" (click)="remove()">
            <i class="bi bi-trash"></i> Delete
          </button>
        }
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Save</button>
      </div>
    </form>
  `,
})
export class WarrantyEditor {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly kinds = WARRANTY_KINDS;
  protected readonly kindLabels = WARRANTY_KIND_LABELS;
  protected readonly key = coverKey;
  protected readonly minDate = { year: 2000, month: 1, day: 1 };
  protected readonly maxDate = { year: new Date().getFullYear() + 30, month: 12, day: 31 };
  protected readonly dateFields = [
    { name: 'startsOn', label: 'Starts', placeholder: 'Usually the purchase day' },
    { name: 'expiresOn', label: 'Runs out on', placeholder: 'e.g. 01/May/2027' },
  ] as const;
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly contacts = toSignal(
    inject(ContactsService)
      .list()
      .pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly assets = toSignal(this.homeService.assets().pipe(catchError(() => of([]))), {
    initialValue: [],
  });
  protected readonly vehicles = toSignal(
    this.homeService.vehicles().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly properties = toSignal(
    this.homeService.properties().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );
  protected readonly warranty = signal<Warranty | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    cover: this.fb.nonNullable.control('', Validators.required),
    kind: this.fb.nonNullable.control<WarrantyKind>('Warranty'),
    provider: this.fb.nonNullable.control('', Validators.maxLength(200)),
    contactId: this.fb.control<number | null>(null),
    startsOn: this.fb.control<string | null>(null),
    expiresOn: this.fb.control<string | null>(null, Validators.required),
    remind: this.fb.nonNullable.control(true),
    reminderDays: this.fb.control<number | null>(30, [Validators.min(0), Validators.max(365)]),
    cost: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.nonNullable.control(''),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(warranty?: Warranty, cover?: { type: HomeTargetType; id: number }): void {
    this.warranty.set(warranty ?? null);
    const target = warranty ? { type: warranty.coverType, id: warranty.coverId } : cover;
    this.form.reset({
      cover: target ? coverKey(target.type, target.id) : '',
      kind: warranty?.kind ?? 'Warranty',
      provider: warranty?.provider ?? '',
      contactId: warranty?.contactId ?? null,
      startsOn: warranty?.startsOn ?? null,
      expiresOn: warranty?.expiresOn ?? null,
      remind: warranty ? warranty.reminderDays !== null : true,
      reminderDays: warranty?.reminderDays ?? 30,
      cost: warranty?.cost ?? null,
      currency: warranty?.currency ?? this.settingsService.settings()?.baseCurrency ?? '',
      notes: warranty?.notes ?? '',
    });
  }

  protected fieldError(
    name: 'cover' | 'startsOn' | 'expiresOn' | 'reminderDays' | 'cost' | 'currency',
  ): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'cover':
        return 'Choose what it covers.';
      case 'expiresOn':
        return control.errors['required']
          ? 'Say when it runs out.'
          : control.errors['order']
            ? 'It can’t run out before it starts.'
            : dateFieldError(control.errors);
      case 'reminderDays':
        return control.errors['required'] ? 'How many days before?' : '0 to 365 days.';
      case 'cost':
        return 'Can’t be negative — or leave it blank.';
      case 'currency':
        return 'Choose the cost’s currency.';
      default:
        return dateFieldError(control.errors);
    }
  }

  protected submit(): void {
    for (const control of ['expiresOn', 'reminderDays', 'currency'] as const) {
      this.form.controls[control].updateValueAndValidity();
    }
    const v = this.form.getRawValue();
    if (v.startsOn && v.expiresOn && v.expiresOn < v.startsOn) {
      this.form.controls.expiresOn.setErrors({ order: true });
    }
    if (v.remind && v.reminderDays === null) {
      this.form.controls.reminderDays.setErrors({ required: true });
    }
    if (v.cost !== null && !v.currency) {
      this.form.controls.currency.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const [coverType, coverId] = v.cover.split(':');
    this.saving.set(true);
    this.homeService
      .saveWarranty(this.warranty()?.id ?? null, {
        kind: v.kind,
        coverType: coverType as HomeTargetType,
        coverId: Number(coverId),
        provider: v.provider.trim() || null,
        startsOn: v.startsOn,
        expiresOn: v.expiresOn!,
        cost: v.cost,
        currency: v.cost !== null ? v.currency : null,
        contactId: v.contactId,
        reminderDays: v.remind ? v.reminderDays : null,
        notes: v.notes.trim() || null,
        timeZone: browserTimeZone(),
      })
      .subscribe({
        next: (warranty) => this.activeModal.close({ kind: 'saved', warranty }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the warranty.'));
        },
      });
  }

  protected async remove(): Promise<void> {
    const warranty = this.warranty();
    if (!warranty) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete this ${this.kindLabels[warranty.kind].toLowerCase()}?`,
      text: `On ${warranty.coverName}. Its reminder goes too; a linked warranty card stays in Documents.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.homeService.removeWarranty(warranty.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the warranty.')),
    });
  }
}
