import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { PingService } from '../../core/services/ping.service';
import { TagPicker } from '../../shared/components/tag-picker/tag-picker';

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagPicker],
  templateUrl: './home.html',
})
export class Home implements OnInit {
  private readonly pingService = inject(PingService);

  protected readonly apiMessage = signal('Connecting to API...');
  protected readonly demoSelectedTagIds = signal<number[]>([]);

  ngOnInit(): void {
    this.pingService.ping().subscribe({
      next: (response) => this.apiMessage.set(`${response.message} (server time UTC: ${response.serverTimeUtc})`),
      error: () => this.apiMessage.set('Could not reach the LifeOS API — is LifeOS.Api running?'),
    });
  }
}
