import { BadRequestException } from '@nestjs/common';

export const invalidRegistration = (code: string, message: string): never => {
  throw new BadRequestException({ code, message });
};

export function normalizeDisplayName(value: string): string {
  const name = value.trim();
  if (!name)
    invalidRegistration('INVALID_DISPLAY_NAME', 'Informe o nome de exibição');
  return name;
}

export function normalizeWhatsapp(value: string): string {
  const normalized = value
    .trim()
    .replace(/[\s().-]/g, '')
    .replace(/^00/, '+');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    return invalidRegistration(
      'INVALID_WHATSAPP',
      'Informe WhatsApp com DDI em formato E.164',
    );
  }
  return normalized;
}

export function adultBirthDate(value: string, now = new Date()): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return invalidRegistration(
      'INVALID_BIRTH_DATE',
      'Informe uma data civil YYYY-MM-DD válida',
    );
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return invalidRegistration(
      'INVALID_BIRTH_DATE',
      'Data de nascimento inválida',
    );
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Maceio',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (name: string) =>
    Number(parts.find((p) => p.type === name)!.value);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const age =
    part('year') -
    year -
    (part('month') < month || (part('month') === month && part('day') < day)
      ? 1
      : 0);
  if (age < 18) {
    return invalidRegistration(
      'ADULT_ACCOUNT_REQUIRED',
      'O cadastro exige idade mínima de 18 anos',
    );
  }
  return date;
}
