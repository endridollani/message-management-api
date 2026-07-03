import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

import { IS_PUBLIC_ROUTE } from './public.decorator';

type ApiKeyConfig = {
  name: string;
  hash: string;
};

export type ApiKeyAuthenticatedRequest = Request & {
  apiKeyName?: string;
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly apiKeys: ApiKeyConfig[];

  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {
    this.apiKeys = this.configService.get<ApiKeyConfig[]>('app.apiKeys') ?? [];
  }

  canActivate(context: ExecutionContext): boolean {
    if (this.isPublic(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<ApiKeyAuthenticatedRequest>();
    const apiKey = request.header('x-api-key');

    if (!apiKey || !this.authenticate(apiKey, request)) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private authenticate(apiKey: string, request: ApiKeyAuthenticatedRequest): boolean {
    const actualHash = createHash('sha256').update(apiKey).digest('hex');
    const actualBuffer = Buffer.from(actualHash, 'hex');

    for (const configuredKey of this.apiKeys) {
      const expectedBuffer = Buffer.from(configuredKey.hash, 'hex');

      if (
        expectedBuffer.length === actualBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
      ) {
        request.apiKeyName = configuredKey.name;
        return true;
      }
    }

    return false;
  }
}
