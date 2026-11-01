import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { ReaderComponent } from './app/reader.component';

// Zoneless: no zone.js polyfill to download and run before the first screen
// (public reader on phones); the player works with either.
bootstrapApplication(ReaderComponent, {
  ...appConfig,
  providers: [provideZonelessChangeDetection(), ...appConfig.providers],
}).catch((err) => console.error(err));
