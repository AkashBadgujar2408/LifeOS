import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  TemplateRef,
  computed,
  inject,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgbOffcanvas } from '@ng-bootstrap/ng-bootstrap';
import { AuthService } from '../services/auth.service';
import { InboxService } from '../services/inbox.service';
import { QuickAddService } from '../services/quick-add.service';
import { RemindersService } from '../services/reminders.service';
import { QuickAdd } from '../../shared/components/quick-add/quick-add';
import { NAV_GROUPS } from './nav-items';

const REMINDER_CHECK_MS = 60_000;

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, QuickAdd],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  private readonly router = inject(Router);
  private readonly offcanvas = inject(NgbOffcanvas);
  protected readonly authService = inject(AuthService);
  protected readonly inboxService = inject(InboxService);
  protected readonly quickAdd = inject(QuickAddService);
  protected readonly remindersService = inject(RemindersService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly navGroups = NAV_GROUPS;

  protected readonly initials = computed(() => {
    const name = this.authService.currentUser()?.displayName ?? '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('');
  });

  ngOnInit(): void {
    this.inboxService.refreshOpenCounts();

    // No job server (deferred to Phase 2): reminders surface because the app asks what's due — now, every minute
    // while it's open, and whenever the tab comes back into view.
    this.remindersService.refreshDue();
    const timer = setInterval(() => this.remindersService.refreshDue(), REMINDER_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        this.remindersService.refreshDue();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /** Sidebar count for a nav entry, or 0 for none. */
  protected badgeCount(route: string): number {
    switch (route) {
      case '/inbox':
        return this.inboxService.openTotal();
      case '/reminders':
        return this.remindersService.due().length;
      default:
        return 0;
    }
  }

  protected openDrawer(content: TemplateRef<unknown>): void {
    this.offcanvas.open(content, { panelClass: 'lifeos-drawer', ariaLabelledBy: 'drawer-title' });
  }

  /** Nav links inside the mobile drawer close it; on desktop there's no drawer, so this is a no-op. */
  protected closeDrawer(): void {
    this.offcanvas.dismiss();
  }

  protected openQuickAdd(): void {
    this.closeDrawer();
    this.quickAdd.open();
  }

  logout(): void {
    this.closeDrawer();
    this.authService.logout();
    this.inboxService.resetOpenCounts();
    this.remindersService.reset();
    this.router.navigateByUrl('/login');
  }
}
