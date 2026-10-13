import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PingService } from './core/services/ping.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnInit {
  private readonly pingService = inject(PingService);

  protected readonly title = signal('LifeOS');
  protected readonly apiMessage = signal('Connecting to API...');

  ngOnInit(): void {
    this.pingService.ping().subscribe({
      next: (response) => this.apiMessage.set(`${response.message} (server time UTC: ${response.serverTimeUtc})`),
      error: () => this.apiMessage.set('Could not reach the LifeOS API — is LifeOS.Api running?'),
    });
  }
}
