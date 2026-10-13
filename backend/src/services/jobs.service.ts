import { Inject, Injectable, Logger } from '@nestjs/common';
import { VisitsService } from './visits.service';

@Injectable()
export class JobsService {
  private readonly log = new Logger('Jobs');
  private timer?: NodeJS.Timeout;

  constructor(@Inject(VisitsService) private readonly visits: VisitsService) {}

  /** One pass of every scheduled rule. Each step is idempotent, so overlapping runs are safe. */
  async runAll() {
    const expired = await this.visits.expireOverdue();
    const reminders = await this.visits.sendReminders();
    const sweep = await this.visits.closingSweep();
    const anonymised = await this.visits.anonymiseOld();
    return { expired, reminders, ...sweep, anonymised };
  }

  start(everyMs = 60_000) {
    this.timer = setInterval(() => {
      this.runAll().catch((e) => this.log.error(`Job run failed: ${e.message}`));
    }, everyMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
