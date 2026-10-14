import {
  ChangeDetectionStrategy,
  Component,
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
import { QuickAdd } from '../../shared/components/quick-add/quick-add';
import { NAV_GROUPS } from './nav-items';

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
    this.router.navigateByUrl('/login');
  }
}
