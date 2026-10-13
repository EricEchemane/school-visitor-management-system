import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public, RequirePermission, SESSION_COOKIE } from '../common/auth';
import { AuthService, SESSION_HOURS } from '../services/auth.service';
import { VisitsService } from '../services/visits.service';
import { NotificationService } from '../services/notification.service';
import { AuditService } from '../services/audit.service';
import { AdminService } from '../services/admin.service';
import * as dto from './dto';
import { Inject } from '@nestjs/common';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { email, password } = dto.parse(dto.loginSchema, body);
    const { sessionId, user } = await this.auth.login(email, password);
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: SESSION_HOURS * 3_600_000,
      path: '/',
    });
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

@Controller('visits')
export class VisitsController {
  constructor(@Inject(VisitsService) private readonly visits: VisitsService) {}

  @Post()
  @RequirePermission('visit:preregister')
  create(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.visits.preRegister(u, dto.parse(dto.preRegisterSchema, body));
  }

  @Get('mine')
  @RequirePermission('visit:preregister', 'visit:host')
  mine(@CurrentUser() u: AuthUser) {
    return this.visits.mine(u);
  }

  @Get('expected')
  @RequirePermission('visit:checkin')
  expected(@Query('q') q?: string) {
    return this.visits.expectedToday(q);
  }

  @Get('awaiting')
  @RequirePermission('visit:checkin', 'visit:view_all')
  awaiting() {
    return this.visits.awaitingHost();
  }

  @Get('outcomes')
  @RequirePermission('visit:checkin', 'visit:view_all')
  outcomes() {
    return this.visits.recentWalkInOutcomes();
  }

  @Get('on-campus')
  @RequirePermission('visit:view_all')
  onCampus() {
    return this.visits.onCampus();
  }

  @Get('history')
  @RequirePermission('audit:view')
  history() {
    return this.visits.history();
  }

  @Post('walk-in')
  @RequirePermission('visit:checkin')
  walkIn(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.visits.registerWalkIn(u, dto.parse(dto.walkInSchema, body));
  }

  @Post('check-out')
  @HttpCode(200)
  @RequirePermission('visit:checkout')
  checkOut(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.visits.checkOut(u, dto.parse(dto.checkOutSchema, body).code);
  }

  @Patch(':id')
  @RequirePermission('visit:preregister')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.visits.updatePreRegistration(u, id, dto.parse(dto.updatePreSchema, body));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('visit:preregister')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.visits.cancel(u, id);
  }

  @Post(':id/check-in')
  @HttpCode(200)
  @RequirePermission('visit:checkin')
  checkIn(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.visits.checkIn(u, id);
  }

  @Post(':id/respond')
  @HttpCode(200)
  @RequirePermission('visit:host')
  respond(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const { decision, reason } = dto.parse(dto.respondSchema, body);
    return this.visits.hostRespond(u, id, decision, reason);
  }

  @Post(':id/correct-departure')
  @HttpCode(200)
  @RequirePermission('visit:correct_departure')
  correct(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.visits.correctDeparture(u, id, new Date(dto.parse(dto.correctSchema, body).departedAt));
  }

  @Get(':id/pass')
  @RequirePermission('visit:checkin', 'visit:view_all')
  pass(@Param('id', ParseUUIDPipe) id: string) {
    return this.visits.pass(id);
  }
}

@Controller()
export class DirectoryController {
  constructor(
    @Inject(VisitsService) private readonly visits: VisitsService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get('hosts')
  @RequirePermission('visit:preregister', 'visit:checkin')
  hosts() {
    return this.visits.hosts();
  }

  @Get('notifications')
  @RequirePermission('visit:host', 'visit:preregister')
  inbox(@CurrentUser() u: AuthUser) {
    return this.notifications.inbox(u.id);
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  @RequirePermission('visit:host', 'visit:preregister')
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.markRead(u.id, id);
  }

  @Get('messages')
  @RequirePermission('messages:view')
  messages() {
    return this.notifications.sentMessages();
  }

  @Get('audit')
  @RequirePermission('audit:view')
  auditTrail(@Query('action') action?: string, @Query('targetId') targetId?: string) {
    return this.audit.list({ action, targetId });
  }
}

@Controller('admin')
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get('users')
  @RequirePermission('user:manage')
  users() {
    return this.admin.listUsers();
  }

  @Post('users')
  @RequirePermission('user:manage')
  createUser(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    return this.admin.createUser(u, dto.parse(dto.createUserSchema, body));
  }

  @Patch('users/:id')
  @HttpCode(204)
  @RequirePermission('user:manage')
  async updateUser(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    await this.admin.updateUser(u, id, dto.parse(dto.updateUserSchema, body));
  }

  @Get('permissions')
  @RequirePermission('role:manage')
  permissions() {
    return this.admin.permissions();
  }

  @Get('roles')
  @RequirePermission('role:manage', 'user:manage')
  roles() {
    return this.admin.listRoles();
  }

  @Post('roles')
  @RequirePermission('role:manage')
  createRole(@CurrentUser() u: AuthUser, @Body() body: unknown) {
    const { name, permissions } = dto.parse(dto.roleSchema, body);
    return this.admin.createRole(u, name, permissions);
  }

  @Put('roles/:id/permissions')
  @HttpCode(204)
  @RequirePermission('role:manage')
  async setPermissions(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: unknown) {
    await this.admin.setRolePermissions(u, id, dto.parse(dto.rolePermsSchema, body).permissions);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermission('role:manage')
  async deleteRole(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.admin.deleteRole(u, id);
  }
}
