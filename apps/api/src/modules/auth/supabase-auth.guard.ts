import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type AuthenticatedRequest = {
  headers: Record<string, string | string[] | undefined>;
  userId?: string;
  userEmail?: string;
};

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const raw = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = raw?.startsWith('Bearer ') ? raw.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Autenticação necessária');

    const url = this.config.get<string>('SUPABASE_URL');
    const publishableKey = this.config.get<string>('SUPABASE_PUBLISHABLE_KEY');
    if (!url || !publishableKey) throw new ServiceUnavailableException('Autenticação ainda não configurada');

    const response = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) throw new UnauthorizedException('Sessão inválida ou expirada');

    const user = await response.json() as { id?: string; email?: string };
    if (!user.id) throw new UnauthorizedException('Usuário inválido');
    request.userId = user.id;
    request.userEmail = user.email;
    return true;
  }
}
