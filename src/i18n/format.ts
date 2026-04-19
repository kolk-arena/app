import { copy } from '@/i18n';
import type { FrontendLocaleCode } from '@/i18n/types';

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  localeCode: FrontendLocaleCode | string = copy.localeCode,
) {
  return new Intl.NumberFormat(localeCode, options).format(value);
}

export function formatDateTime(
  value: DateInput,
  fallback = '',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
  localeCode: FrontendLocaleCode | string = copy.localeCode,
) {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(localeCode, options).format(date);
}

export function formatTimeOnly(
  value: DateInput,
  fallback = '',
  options: Intl.DateTimeFormatOptions = { timeStyle: 'short' },
  localeCode: FrontendLocaleCode | string = copy.localeCode,
) {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(localeCode, options).format(date);
}

export function formatClockSeconds(total: number) {
  if (!Number.isFinite(total) || total < 0) return '0:00';
  const minutes = Math.floor(total / 60);
  const seconds = Math.floor(total % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
