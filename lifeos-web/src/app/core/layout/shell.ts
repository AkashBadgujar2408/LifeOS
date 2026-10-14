import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { QuickAdd } from '../../shared/components/quick-add/quick-add';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, QuickAdd],
  templateUrl: './shell.html',
})
export class Shell {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
