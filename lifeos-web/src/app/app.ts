import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toasts } from './shared/components/toasts/toasts';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Toasts],
  template: '<router-outlet /><app-toasts />',
})
export class App {}
