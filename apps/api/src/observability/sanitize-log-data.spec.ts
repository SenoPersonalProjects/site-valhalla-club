import { REDACTED_LOG_VALUE, sanitizeLogData } from './sanitize-log-data';

describe('sanitizeLogData', () => {
  it('redacts sensitive fields recursively without changing the source', () => {
    const source = {
      requestId: 'request-123',
      method: 'POST',
      headers: {
        authorization: 'Bearer secret-token',
        cookie: 'session=secret',
        accept: 'application/json',
      },
      body: {
        email: 'member@example.com',
        password: 'secret-password',
      },
      metadata: {
        senha: 'outra-senha',
        jwt: 'jwt-secreto',
      },
      report: {
        description: 'conteúdo completo do report',
      },
      advertência: 'conteúdo da advertência',
      sanção: 'conteúdo da sanção',
      linksDeEvidência: ['https://example.com/evidencia'],
    };

    const sanitized = sanitizeLogData(source);

    expect(sanitized).toEqual({
      requestId: 'request-123',
      method: 'POST',
      headers: {
        authorization: REDACTED_LOG_VALUE,
        cookie: REDACTED_LOG_VALUE,
        accept: 'application/json',
      },
      body: REDACTED_LOG_VALUE,
      metadata: {
        senha: REDACTED_LOG_VALUE,
        jwt: REDACTED_LOG_VALUE,
      },
      report: REDACTED_LOG_VALUE,
      advertência: REDACTED_LOG_VALUE,
      sanção: REDACTED_LOG_VALUE,
      linksDeEvidência: REDACTED_LOG_VALUE,
    });
    expect(source.body.password).toBe('secret-password');
  });

  it('redacts bearer tokens and JWTs inside diagnostic messages', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.payload.signature';
    const sanitized = sanitizeLogData({
      message: `Authorization failed for Bearer secret-token and ${jwt}`,
    });
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain(jwt);
    expect(serialized).toContain(REDACTED_LOG_VALUE);
  });

  it('keeps diagnostic identifiers that are safe to log', () => {
    const sanitized = sanitizeLogData({
      reportId: 'report-123',
      warningCode: 'WARNING_ALREADY_APPLIED',
      sanctionCode: 'TEMPORARY_SUSPENSION',
    });

    expect(sanitized).toEqual({
      reportId: 'report-123',
      warningCode: 'WARNING_ALREADY_APPLIED',
      sanctionCode: 'TEMPORARY_SUSPENSION',
    });
  });

  it('handles circular references safely', () => {
    const source: Record<string, unknown> = { requestId: 'request-123' };
    source.self = source;

    expect(sanitizeLogData(source)).toEqual({
      requestId: 'request-123',
      self: '[Circular]',
    });
  });
});
