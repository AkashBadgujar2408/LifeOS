import { effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';

/**
 * Titles a detail page by its item ("Visit Japan | LifeOS") once it has loaded. The route's own title ("Goal |
 * LifeOS") shows until then and comes back on the next navigation, since the router sets every route's title.
 * Call in an injection context (a constructor or field initializer).
 */
export function itemTitle(name: () => string | null | undefined): void {
  const title = inject(Title);
  effect(() => {
    const value = name()?.trim();
    if (value) {
      title.setTitle(`${value} | LifeOS`);
    }
  });
}
