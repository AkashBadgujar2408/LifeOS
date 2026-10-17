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
import { SearchPaletteService } from '../services/search-palette.service';
import { SettingsService } from '../services/settings.service';
import { visibleNavGroups } from '../settings/visibility';
import { QuickAdd } from '../../shared/components/quick-add/quick-add';
import { NAV_GROUPS } from './nav-items';

const REMINDER_CHECK_MS = 60_000;

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, QuickAdd],
  host: { '(document:keydown)': 'onKeydown($event)' },
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
  private readonly searchPalette = inject(SearchPaletteService);
  private readonly settingsService = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);

  /** The navigation without the modules switched off in Settings. */
  protected readonly navGroups = computed(() =>
    visibleNavGroups(NAV_GROUPS, this.settingsService.hiddenModules()),
  );

  /** How the search shortcut reads on this machine. */
  protected readonly searchShortcut = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';

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
    // What's switched off shapes the nav and My Day. If this fails, everything just stays visible.
    this.settingsService.load().subscribe({ error: () => undefined });

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

  protected openSearch(): void {
    this.closeDrawer();
    void this.searchPalette.open();
  }

  /**
   * Ctrl+K / Cmd+K opens search from anywhere, even while typing (the usual palette shortcut); "/" only when not
   * typing in a field, so it can still be typed.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const modifier = event.ctrlKey || event.metaKey;
    const isPaletteKey = modifier && !event.altKey && event.key.toLowerCase() === 'k';
    const isSlash = event.key === '/' && !modifier && !event.altKey && !isTyping(event.target);
    if (isPaletteKey || isSlash) {
      event.preventDefault();
      void this.searchPalette.open();
    }
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
    this.settingsService.reset();
    this.router.navigateByUrl('/login');
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
