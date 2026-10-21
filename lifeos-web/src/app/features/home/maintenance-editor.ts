import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbActiveModal, NgbInputDatepicker, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { dateFieldError } from '../../core/dates/date-format';
import { browserTimeZone, todayIso } from '../../core/dates/today';
import { apiErrorMessage } from '../../core/services/api-error';
import { ContactsService } from '../../core/services/contacts.service';
import {
  HomeService,
  HomeTargetType,
  MaintenanceLog,
  MaintenanceTask,
} from '../../core/services/home.service';
import { SettingsService } from '../../core/services/settings.service';
import { RECURRENCE_FREQUENCIES, RecurrenceFrequency } from '../../core/services/tasks.service';
import { ToastService } from '../../core/services/toast.service';
import { EntityReminders } from '../../shared/components/entity-reminders/entity-reminders';
import { LinkedItems } from '../../shared/components/linked-items/linked-items';
import { formatMoney } from '../finance/finance-view';

export type MaintenanceEditorResult =
  { kind: 'saved'; task: MaintenanceTask } | { kind: 'deleted' };

/** Opens maintenance (new when missing, optionally for an item); resolves with what happened, or null. */
export async function openMaintenanceEditor(
  modal: NgbModal,
  task?: MaintenanceTask,
  target?: { type: HomeTargetType; id: number },
): Promise<MaintenanceEditorResult | null> {
  const modalRef = modal.open(MaintenanceEditor, {
    ariaLabelledBy: 'maintenance-editor-heading',
    size: 'lg',
  });
  (modalRef.componentInstance as MaintenanceEditor).configure(task, target);
  try {
    return (await modalRef.result) as MaintenanceEditorResult;
  } catch {
    return null;
  }
}

const targetKey = (type: HomeTargetType, id: number) => `${type}:${id}`;

const UNIT_WORDS: Record<RecurrenceFrequency, string> = {
  Daily: 'days',
  Weekly: 'weeks',
  Monthly: 'months',
  Yearly: 'years',
};

/**
 * Maintenance that comes round again: what, on which item, how often, when it's first due, who does it, a reminder
 * before each due day (kept by the server) — and, once saved, every time it was done (a mistaken one can be taken
 * back, which moves the next due day back).
 */
@Component({
  selector: 'app-maintenance-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NgbInputDatepicker,
    DatePipe,
    DecimalPipe,
    LinkedItems,
    EntityReminders,
    NgOptionComponent,
    NgSelectComponent,
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="maintenance-editor-heading" class="modal-title h5">
          {{ task() ? 'Edit maintenance' : 'Add maintenance' }}
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
            <label class="form-label" for="maintenance-title">What needs doing</label>
            <input
              id="maintenance-title"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('title')"
              formControlName="title"
              placeholder="e.g. Service the car"
              autocomplete="off"
              ngbAutofocus
            />
            @if (fieldError('title'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-sm-5">
            <label class="form-label" for="maintenance-target">For</label>
            <ng-select
              labelForId="maintenance-target"
              formControlName="target"
              placeholder="Nothing in particular"
            >
              @if (vehicles().length) {
                <optgroup label="Vehicles">
                  @for (v of vehicles(); track v.id) {
                    <ng-option [value]="key('Vehicle', v.id)">
                      {{ v.name }}
                    </ng-option>
                  }
                </optgroup>
              }
              @if (assets().length) {
                <optgroup label="Belongings">
                  @for (a of assets(); track a.id) {
                    <ng-option [value]="key('Asset', a.id)">
                      {{ a.name }}
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
          </div>
        </div>
        <div class="row g-3 align-items-start">
          <div class="col-sm-6">
            <span class="form-label d-block" id="maintenance-every-label">Every</span>
            <div class="input-group" role="group" aria-labelledby="maintenance-every-label">
              <input
                type="number"
                min="1"
                max="999"
                step="1"
                class="form-control"
                [class.is-invalid]="fieldError('interval')"
                formControlName="interval"
                placeholder="6"
                aria-label="How many"
              />
              <select
                class="form-select"
                formControlName="frequency"
                aria-label="Days, weeks, months or years"
              >
                @for (f of frequencies; track f) {
                  <option [ngValue]="f" [selected]="f === form.controls.frequency.value">
                    {{ units[f] }}
                  </option>
                }
              </select>
            </div>
            @if (fieldError('interval'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
            <div class="form-text">Counted from the last time it was done.</div>
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="maintenance-first">First due on</label>
            <div class="input-group">
              <input
                id="maintenance-first"
                type="text"
                class="form-control"
                [class.is-invalid]="fieldError('firstDueOn')"
                formControlName="firstDueOn"
                placeholder="e.g. 01/Nov/2026"
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
                aria-label="Pick the first due day"
                (click)="picker.toggle()"
              >
                <i class="bi bi-calendar3"></i>
              </button>
            </div>
            @if (fieldError('firstDueOn'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        <div class="row g-3">
          <div class="col-sm-6">
            <label class="form-label" for="maintenance-contact">
              Who does it <span class="text-body-secondary small">(a contact)</span>
            </label>
            <ng-select
              labelForId="maintenance-contact"
              formControlName="contactId"
              placeholder="None"
            >
              @for (c of contacts(); track c.id) {
                <ng-option [value]="c.id">
                  {{ c.name }}
                </ng-option>
              }
            </ng-select>
          </div>
          <div class="col-sm-6 d-flex align-items-end">
            <div class="form-check mb-2">
              <input
                id="maintenance-paused"
                type="checkbox"
                class="form-check-input"
                formControlName="isPaused"
              />
              <label class="form-check-label" for="maintenance-paused">
                Paused (not due, no reminder)
              </label>
            </div>
          </div>
        </div>
        <div class="d-flex flex-wrap align-items-center gap-2">
          <div class="form-check mb-0">
            <input
              id="maintenance-remind"
              type="checkbox"
              class="form-check-input"
              formControlName="remind"
            />
            <label class="form-check-label" for="maintenance-remind">Remind me</label>
          </div>
          <input
            type="number"
            min="0"
            max="365"
            class="form-control form-control-sm"
            style="width: 5.5rem"
            [class.is-invalid]="fieldError('reminderDays')"
            formControlName="reminderDays"
            placeholder="3"
            aria-label="Days before it's due"
          />
          <span class="small">days before it's due</span>
          @if (fieldError('reminderDays'); as error) {
            <div class="invalid-feedback d-block w-100">{{ error }}</div>
          }
        </div>
        <div>
          <label class="form-label" for="maintenance-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <textarea
            id="maintenance-notes"
            class="form-control"
            rows="2"
            formControlName="notes"
            placeholder="What it involves, the parts to ask for"
          ></textarea>
        </div>
        @if (task(); as t) {
          <div class="border-top pt-3">
            <h3 class="h6">Done so far</h3>
            @if (logs().length === 0) {
              <p class="small text-body-secondary mb-0">
                Not done yet — first due {{ t.firstDueOn | date }}.
              </p>
            } @else {
              <ul class="list-unstyled small mb-0 d-flex flex-column gap-1">
                @for (log of logs(); track log.id) {
                  <li class="d-flex flex-wrap align-items-center gap-2">
                    <span class="fw-semibold">{{ log.doneOn | date }}</span>
                    @if (log.cost !== null && log.currency) {
                      <span>{{ money(log.cost, log.currency) }}</span>
                    }
                    @if (log.odometerKm !== null) {
                      <span class="text-body-secondary">{{ log.odometerKm | number }} km</span>
                    }
                    @if (log.notes) {
                      <span class="text-body-secondary text-break">{{ log.notes }}</span>
                    }
                    <button
                      type="button"
                      class="btn btn-link btn-sm p-0 ms-auto link-secondary"
                      (click)="removeLog(log)"
                    >
                      Take back
                    </button>
                  </li>
                }
              </ul>
            }
          </div>
          <div class="border-top pt-3">
            <app-linked-items entityType="MaintenanceTask" [entityId]="t.id" />
          </div>
          <div class="border-top pt-3">
            <app-entity-reminders
              entityType="MaintenanceTask"
              [entityId]="t.id"
              [entityTitle]="t.title"
            />
          </div>
        }
      </div>
      <div class="modal-footer">
        @if (task()) {
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
export class MaintenanceEditor {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly frequencies = RECURRENCE_FREQUENCIES;
  protected readonly units = UNIT_WORDS;
  protected readonly key = targetKey;
  protected readonly money = formatMoney;
  protected readonly minDate = { year: 2000, month: 1, day: 1 };
  protected readonly maxDate = { year: new Date().getFullYear() + 10, month: 12, day: 31 };
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
  protected readonly task = signal<MaintenanceTask | null>(null);
  protected readonly logs = signal<MaintenanceLog[]>([]);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(200)]),
    target: this.fb.nonNullable.control(''),
    interval: this.fb.control<number | null>(6, [
      Validators.required,
      Validators.min(1),
      Validators.max(999),
    ]),
    frequency: this.fb.nonNullable.control<RecurrenceFrequency>('Monthly'),
    firstDueOn: this.fb.control<string | null>(null, Validators.required),
    contactId: this.fb.control<number | null>(null),
    isPaused: this.fb.nonNullable.control(false),
    remind: this.fb.nonNullable.control(true),
    reminderDays: this.fb.control<number | null>(3, [Validators.min(0), Validators.max(365)]),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(task?: MaintenanceTask, target?: { type: HomeTargetType; id: number }): void {
    this.task.set(task ?? null);
    const on =
      task?.targetType && task.targetId !== null
        ? { type: task.targetType, id: task.targetId }
        : task
          ? undefined
          : target;
    this.form.reset({
      title: task?.title ?? '',
      target: on ? targetKey(on.type, on.id) : '',
      interval: task?.recurrenceInterval ?? 6,
      frequency: task?.recurrenceFrequency ?? 'Monthly',
      firstDueOn: task?.firstDueOn ?? todayIso(),
      contactId: task?.contactId ?? null,
      isPaused: task?.isPaused ?? false,
      remind: task ? task.reminderDays !== null : true,
      reminderDays: task?.reminderDays ?? 3,
      notes: task?.notes ?? '',
    });
    if (task) {
      this.loadLogs(task.id);
    }
  }

  private loadLogs(id: number): void {
    this.homeService
      .maintenanceLogs(id)
      .pipe(catchError(() => of([])))
      .subscribe((logs) => this.logs.set(logs));
  }

  protected fieldError(name: 'title' | 'interval' | 'firstDueOn' | 'reminderDays'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'title':
        return control.errors['required']
          ? 'Say what needs doing (e.g. Service the car).'
          : 'That is too long.';
      case 'interval':
        return 'Every 1 to 999.';
      case 'firstDueOn':
        return control.errors['required']
          ? 'Say when it’s first due.'
          : dateFieldError(control.errors);
      default:
        return control.errors['required'] ? 'How many days before?' : '0 to 365 days.';
    }
  }

  protected submit(): void {
    const title = this.form.controls.title;
    title.setValue(title.value.trim());
    this.form.controls.reminderDays.updateValueAndValidity();
    const v = this.form.getRawValue();
    if (v.remind && v.reminderDays === null) {
      this.form.controls.reminderDays.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const [targetType, targetId] = v.target ? v.target.split(':') : [null, null];
    this.saving.set(true);
    this.homeService
      .saveMaintenance(this.task()?.id ?? null, {
        title: v.title,
        targetType: targetType as HomeTargetType | null,
        targetId: targetId ? Number(targetId) : null,
        recurrenceFrequency: v.frequency,
        recurrenceInterval: v.interval!,
        firstDueOn: v.firstDueOn!,
        isPaused: v.isPaused,
        contactId: v.contactId,
        reminderDays: v.remind ? v.reminderDays : null,
        notes: v.notes.trim() || null,
        timeZone: browserTimeZone(),
      })
      .subscribe({
        next: (task) => this.activeModal.close({ kind: 'saved', task }),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not save the maintenance.'));
        },
      });
  }

  protected removeLog(log: MaintenanceLog): void {
    const task = this.task();
    if (!task) {
      return;
    }
    this.homeService.removeLog(task.id, log.id).subscribe({
      next: (updated) => {
        this.task.set(updated);
        this.logs.update((logs) => logs.filter((l) => l.id !== log.id));
        this.toast.success('Taken back — the next due day moved back.');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not take it back.')),
    });
  }

  protected async remove(): Promise<void> {
    const task = this.task();
    if (!task) {
      return;
    }
    const confirmed = await Swal.fire({
      title: `Delete "${task.title}"?`,
      text: 'Its history and reminder go too. Expenses recorded in Finance stay.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!confirmed.isConfirmed) {
      return;
    }
    this.homeService.removeMaintenance(task.id).subscribe({
      next: () => this.activeModal.close({ kind: 'deleted' }),
      error: (err) => this.toast.error(apiErrorMessage(err, 'Could not delete the maintenance.')),
    });
  }
}

/** Opens the "done" dialog for a maintenance task; resolves with the updated task, or null if dismissed. */
export async function openMaintenanceDone(
  modal: NgbModal,
  task: MaintenanceTask,
  isVehicle: boolean,
): Promise<MaintenanceTask | null> {
  const modalRef = modal.open(MaintenanceDone, { ariaLabelledBy: 'maintenance-done-heading' });
  (modalRef.componentInstance as MaintenanceDone).configure(task, isVehicle);
  try {
    return (await modalRef.result) as MaintenanceTask;
  } catch {
    return null;
  }
}

/** "Done": the day (today by default), what it cost, the odometer for a vehicle. The next due day moves on. */
@Component({
  selector: 'app-maintenance-done',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NgbInputDatepicker, NgOptionComponent, NgSelectComponent],
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="modal-header">
        <h2 id="maintenance-done-heading" class="modal-title h5">{{ task()?.title }} — done</h2>
        <button
          type="button"
          class="btn-close"
          aria-label="Close"
          (click)="activeModal.dismiss()"
        ></button>
      </div>
      <div class="modal-body d-flex flex-column gap-3">
        <div>
          <label class="form-label" for="done-on">Done on</label>
          <div class="input-group">
            <input
              id="done-on"
              type="text"
              class="form-control"
              [class.is-invalid]="fieldError('doneOn')"
              formControlName="doneOn"
              placeholder="e.g. 20/Oct/2026"
              autocomplete="off"
              ngbDatepicker
              #picker="ngbDatepicker"
              [maxDate]="maxDate"
              container="body"
            />
            <button
              type="button"
              class="btn btn-outline-secondary"
              aria-label="Pick the day"
              (click)="picker.toggle()"
            >
              <i class="bi bi-calendar3"></i>
            </button>
          </div>
          @if (fieldError('doneOn'); as error) {
            <div class="invalid-feedback d-block">{{ error }}</div>
          }
        </div>
        <div class="row g-3">
          <div class="col-7">
            <label class="form-label" for="done-cost">
              It cost <span class="text-body-secondary small">(optional)</span>
            </label>
            <input
              id="done-cost"
              type="number"
              step="0.01"
              min="0"
              class="form-control"
              [class.is-invalid]="fieldError('cost')"
              formControlName="cost"
              placeholder="e.g. 4500"
            />
            @if (fieldError('cost'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
          <div class="col-5">
            <label class="form-label" for="done-currency">Currency</label>
            <ng-select
              labelForId="done-currency"
              [class.is-invalid]="fieldError('currency')"
              formControlName="currency"
              placeholder="—"
            >
              @for (c of currencies(); track c.code) {
                <ng-option [value]="c.code">
                  {{ c.code }}
                </ng-option>
              }
            </ng-select>
            @if (fieldError('currency'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        </div>
        @if (isVehicle()) {
          <div>
            <label class="form-label" for="done-odometer">
              Odometer <span class="text-body-secondary small">(km, optional)</span>
            </label>
            <input
              id="done-odometer"
              type="number"
              min="0"
              step="1"
              class="form-control"
              [class.is-invalid]="fieldError('odometerKm')"
              formControlName="odometerKm"
              placeholder="e.g. 32000"
            />
            @if (fieldError('odometerKm'); as error) {
              <div class="invalid-feedback d-block">{{ error }}</div>
            }
          </div>
        }
        <div>
          <label class="form-label" for="done-notes">
            Notes <span class="text-body-secondary small">(optional)</span>
          </label>
          <input
            id="done-notes"
            type="text"
            class="form-control"
            formControlName="notes"
            placeholder="e.g. Oil and filter changed"
            autocomplete="off"
          />
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-outline-secondary" (click)="activeModal.dismiss()">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary" [disabled]="saving()">Mark done</button>
      </div>
    </form>
  `,
})
export class MaintenanceDone {
  private readonly fb = inject(FormBuilder);
  private readonly homeService = inject(HomeService);
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  protected readonly activeModal = inject(NgbActiveModal);

  protected readonly task = signal<MaintenanceTask | null>(null);
  protected readonly isVehicle = signal(false);
  protected readonly saving = signal(false);
  protected readonly maxDate = (() => {
    const [year, month, day] = todayIso().split('-').map(Number);
    return { year, month, day };
  })();
  protected readonly currencies = toSignal(
    this.settingsService.currencies().pipe(catchError(() => of([]))),
    { initialValue: [] },
  );

  protected readonly form = this.fb.group({
    doneOn: this.fb.control<string | null>(todayIso(), Validators.required),
    cost: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(999_999_999_999_999),
    ]),
    currency: this.fb.nonNullable.control(''),
    odometerKm: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(10_000_000),
    ]),
    notes: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  configure(task: MaintenanceTask, isVehicle: boolean): void {
    this.task.set(task);
    this.isVehicle.set(isVehicle);
    this.form.controls.currency.setValue(this.settingsService.settings()?.baseCurrency ?? '');
  }

  protected fieldError(name: 'doneOn' | 'cost' | 'currency' | 'odometerKm'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.errors) {
      return null;
    }
    switch (name) {
      case 'doneOn':
        return control.errors['required']
          ? 'Say when it was done.'
          : control.errors['future']
            ? 'It can’t be done in the future.'
            : dateFieldError(control.errors);
      case 'cost':
        return 'Can’t be negative — or leave it blank.';
      case 'currency':
        return 'Choose one.';
      default:
        return 'That isn’t an odometer reading.';
    }
  }

  protected submit(): void {
    const task = this.task();
    if (!task) {
      return;
    }
    this.form.controls.doneOn.updateValueAndValidity();
    this.form.controls.currency.updateValueAndValidity();
    const v = this.form.getRawValue();
    const today = todayIso();
    if (v.doneOn && v.doneOn > today) {
      this.form.controls.doneOn.setErrors({ future: true });
    }
    if (v.cost !== null && !v.currency) {
      this.form.controls.currency.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.homeService
      .markDone(task.id, {
        doneOn: v.doneOn!,
        cost: v.cost,
        currency: v.cost !== null ? v.currency : null,
        odometerKm: this.isVehicle() ? v.odometerKm : null,
        notes: v.notes.trim() || null,
        today,
        timeZone: browserTimeZone(),
      })
      .subscribe({
        next: (updated) => this.activeModal.close(updated),
        error: (err) => {
          this.saving.set(false);
          this.toast.error(apiErrorMessage(err, 'Could not mark it done.'));
        },
      });
  }
}
