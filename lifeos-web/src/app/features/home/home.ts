import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { PingService } from '../../core/services/ping.service';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
})
export class Home implements OnInit {
  private readonly pingService = inject(PingService);

  protected readonly apiMessage = signal('Connecting to API...');

  ngOnInit(): void {
    this.pingService.ping().subscribe({
      next: (response) => this.apiMessage.set(`${response.message} (server time UTC: ${response.serverTimeUtc})`),
      error: () => this.apiMessage.set('Could not reach the LifeOS API — is LifeOS.Api running?'),
    });
  }
}
