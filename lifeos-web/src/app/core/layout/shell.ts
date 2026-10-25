import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  TemplateRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { NgbOffcanvas } from '@ng-bootstrap/ng-bootstrap';
import { AssistantPanelService } from '../services/assistant-panel.service';
import { AuthService } from '../services/auth.service';
import { InboxService } from '../services/inbox.service';
import { QuickAddService } from '../services/quick-add.service';
import { RemindersService } from '../services/reminders.service';
import { SearchPaletteService } from '../services/search-palette.service';
import { SettingsService } from '../services/settings.service';
import { visibleNavGroups } from '../settings/visibility';
import { QuickAdd } from '../../shared/components/quick-add/quick-add';
import { NAV_GROUPS, NavGroup } from './nav-items';
import { groupForUrl, readOpenGroups, writeOpenGroups } from './nav-state';

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
  private readonly assistantPanel = inject(AssistantPanelService);
  private readonly settingsService = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);

  /** The navigation without the modules switched off in Settings. */
  protected readonly navGroups = computed(() =>
    visibleNavGroups(NAV_GROUPS, this.settingsService.hiddenModules()),
  );

  /**
   * The two-level sidebar (Session 97a): one group open at a time (remembered per browser) — the one holding the page
   * you're on opens by itself whenever you land somewhere in it, and opening another closes it.
   */
  protected readonly openGroups = signal<ReadonlySet<string>>(readOpenGroups());
  protected readonly currentGroup = signal<string | null>(groupForUrl(NAV_GROUPS, this.router.url));

  constructor() {
    this.revealCurrentGroup();
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.currentGroup.set(groupForUrl(NAV_GROUPS, this.router.url));
        this.revealCurrentGroup();
        // A short screen still scrolls the sidebar: keep the page you're on in view there.
        setTimeout(() =>
          document
            .querySelector('.app-sidebar .sidebar-link.active')
            ?.scrollIntoView({ block: 'nearest' }),
        );
      });
  }

  protected isOpen(group: string): boolean {
    return this.openGroups().has(group);
  }

  protected toggleGroup(group: string): void {
    const open = new Set(this.isOpen(group) ? [] : [group]);
    this.openGroups.set(open);
    writeOpenGroups(open);
  }

  /** What a closed group's entries would show (Inbox items, due reminders), so nothing goes unseen. */
  protected groupCount(group: NavGroup): number {
    return group.items.reduce((sum, item) => sum + this.badgeCount(item.route), 0);
  }

  protected groupHasAlert(group: NavGroup): boolean {
    return group.items.some(
      (item) => item.route === '/reminders' && this.badgeCount(item.route) > 0,
    );
  }

  private revealCurrentGroup(): void {
    const current = this.currentGroup();
    if (current !== null && !this.openGroups().has(current)) {
      const open = new Set([current]);
      this.openGroups.set(open);
      writeOpenGroups(open);
    }
  }

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

  /** The drawer is an offcanvas too, so it closes first — only one can be open. */
  protected openAssistant(): void {
    this.closeDrawer();
    setTimeout(() => void this.assistantPanel.open());
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
