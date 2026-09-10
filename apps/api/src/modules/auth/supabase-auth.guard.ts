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
    const match = /^Bearer\s+([^\s]+)$/i.exec(raw ?? '');
    const token = match?.[1] ?? '';

    if (!token || token.length > 8192) throw new UnauthorizedException('Autenticação necessária');

    const url = this.config.get<string>('SUPABASE_URL');
    const publishableKey = this.config.get<string>('SUPABASE_PUBLISHABLE_KEY');
    if (!url || !publishableKey) throw new ServiceUnavailableException('Autenticação ainda não configurada');

    let endpoint: URL;
    try {
      endpoint = new URL('/auth/v1/user', url);
      if (endpoint.protocol !== 'https:' && this.config.get<string>('NODE_ENV') === 'production') {
        throw new Error('Supabase precisa usar HTTPS em produção');
      }
    } catch {
      throw new ServiceUnavailableException('Configuração de autenticação inválida');
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        headers: {
          apikey: publishableKey,
          authorization: `Bearer ${token}`,
          accept: 'application/json'
        },
        signal: AbortSignal.timeout(5_000)
      });
    } catch {
      throw new ServiceUnavailableException('Serviço de autenticação indisponível');
    }

    if (!response.ok) throw new UnauthorizedException('Sessão inválida ou expirada');

    const user = await response.json() as { id?: string; email?: string };
    if (!user.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new UnauthorizedException('Usuário inválido');

    request.userId = user.id;
    request.userEmail = typeof user.email === 'string' ? user.email : undefined;
    return true;
  }
}
