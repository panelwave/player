import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { StandaloneComponent } from './app/standalone.component';

bootstrapApplication(StandaloneComponent, appConfig)
  .catch((err) => console.error(err));
