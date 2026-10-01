import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { ReaderComponent } from './app/reader.component';

bootstrapApplication(ReaderComponent, appConfig)
  .catch((err) => console.error(err));
