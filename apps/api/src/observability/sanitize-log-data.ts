export const REDACTED_LOG_VALUE = '[REDACTED]';

const CIRCULAR_LOG_VALUE = '[Circular]';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordconfirmation',
  'currentpassword',
  'newpassword',
  'senha',
  'confirmacaodesenha',
  'senhainicial',
  'novasenha',
  'authorization',
  'proxyauthorization',
  'cookie',
  'cookies',
  'setcookie',
  'jwt',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'body',
  'requestbody',
  'responsebody',
  'report',
  'reports',
  'reportbody',
  'reportcontent',
  'relato',
  'relatos',
  'conteudodorelato',
  'warning',
  'warnings',
  'warningcontent',
  'advertencia',
  'advertencias',
  'conteudodaadvertencia',
  'sanction',
  'sanctions',
  'sanctioncontent',
  'sancao',
  'sancoes',
  'conteudodasancao',
  'evidence',
  'evidences',
  'evidenceurl',
  'evidencelink',
  'evidencelinks',
  'evidencia',
  'evidencias',
  'linkdeevidencia',
  'linksdeevidencia',
]);

const BEARER_TOKEN_PATTERN = /\bBearer\s+[^\s,;]+/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function sanitizeString(value: string): string {
  return value
    .replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTED_LOG_VALUE}`)
    .replace(JWT_PATTERN, REDACTED_LOG_VALUE);
}

function sanitizeValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (ancestors.has(value)) {
    return CIRCULAR_LOG_VALUE;
  }

  ancestors.add(value);

  const sanitizedValue = Array.isArray(value)
    ? value.map((item) => sanitizeValue(item, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          SENSITIVE_KEYS.has(normalizeKey(key))
            ? REDACTED_LOG_VALUE
            : sanitizeValue(item, ancestors),
        ]),
      );

  ancestors.delete(value);
  return sanitizedValue;
}

export function sanitizeLogData(value: unknown): unknown {
  return sanitizeValue(value, new WeakSet<object>());
}
