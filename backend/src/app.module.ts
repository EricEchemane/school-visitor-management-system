import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Db } from './db/pool';
import { Clock } from './domain/clock';
import { AuthGuard } from './common/auth';
import { CLOCK, NOTIFICATION_CHANNELS } from './tokens';
import { AuditService } from './services/audit.service';
import { AuthService } from './services/auth.service';
import { SettingsService } from './services/settings.service';
import { NotificationChannel, NotificationService } from './services/notification.service';
import { VisitsService } from './services/visits.service';
import { AdminService } from './services/admin.service';
import { JobsService } from './services/jobs.service';
import {
  AdminController,
  AuthController,
  DirectoryController,
  HealthController,
  VisitsController,
} from './controllers/controllers';

export interface AppOptions {
  db: Db;
  clock: Clock;
  channels: NotificationChannel[];
}

@Module({})
export class AppModule {
  static forRoot(opts: AppOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, AuthController, VisitsController, DirectoryController, AdminController],
      providers: [
        { provide: Db, useValue: opts.db },
        { provide: CLOCK, useValue: opts.clock },
        { provide: NOTIFICATION_CHANNELS, useValue: opts.channels },
        { provide: APP_GUARD, useClass: AuthGuard },
        AuditService,
        AuthService,
        SettingsService,
        NotificationService,
        VisitsService,
        AdminService,
        JobsService,
      ],
      exports: [JobsService, VisitsService],
    };
  }
}
