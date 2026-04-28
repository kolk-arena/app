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
  timeZone?: string,
) {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(
    localeCode,
    timeZone ? { ...options, timeZone } : options,
  ).format(date);
}

export function formatTimeOnly(
  value: DateInput,
  fallback = '',
  options: Intl.DateTimeFormatOptions = { timeStyle: 'short' },
  localeCode: FrontendLocaleCode | string = copy.localeCode,
  timeZone?: string,
) {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(
    localeCode,
    timeZone ? { ...options, timeZone } : options,
  ).format(date);
}

export function formatClockSeconds(total: number) {
  if (!Number.isFinite(total) || total < 0) return '0:00';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatCurrency(
  value: number,
  currency: string,
  localeCode: FrontendLocaleCode | string = copy.localeCode,
) {
  return new Intl.NumberFormat(localeCode, { style: 'currency', currency }).format(value);
}

export function formatRelativeTime(
  value: DateInput,
  now: Date = new Date(),
  localeCode: FrontendLocaleCode | string = copy.localeCode,
) {
  const date = toDate(value);
  if (!date) return '';
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat(localeCode, { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 604800) return rtf.format(Math.round(diffSec / 86400), 'day');
  return rtf.format(Math.round(diffSec / 604800), 'week');
}
