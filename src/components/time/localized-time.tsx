'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { copy } from '@/i18n';
import { formatDateTime, formatTimeOnly } from '@/i18n/format';

type DateInput = string | number | Date | null | undefined;

const UTC_TIME_ZONE = 'UTC';

function resolveBrowserTimeZone() {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof resolved === 'string' && resolved.trim().length > 0 ? resolved : null;
  } catch {
    return null;
  }
}

function toIsoString(value: DateInput) {
  if (value == null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function useBrowserTimeZone() {
  return useSyncExternalStore(
    () => () => {},
    () => resolveBrowserTimeZone(),
    () => null,
  );
}

export function useLocalizedDateTimeFormatter() {
  const timeZone = useBrowserTimeZone();

  return useCallback(
    (
      value: DateInput,
      fallback = '',
      options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
    ) => formatDateTime(value, fallback, options, copy.localeCode, timeZone ?? UTC_TIME_ZONE),
    [timeZone],
  );
}

export function useLocalizedTimeFormatter() {
  const timeZone = useBrowserTimeZone();

  return useCallback(
    (
      value: DateInput,
      fallback = '',
      options: Intl.DateTimeFormatOptions = { timeStyle: 'short' },
    ) => formatTimeOnly(value, fallback, options, copy.localeCode, timeZone ?? UTC_TIME_ZONE),
    [timeZone],
  );
}

export function useServerNow(serverNowUtc?: string | null, tickMs = 1000) {
  const parseServerNow = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };
  const [initialClientNow] = useState(() => Date.now());
  const [initialServerNow] = useState(() => parseServerNow(serverNowUtc) ?? initialClientNow);
  const clientAnchorRef = useRef(initialClientNow);
  const serverAnchorRef = useRef(initialServerNow);
  const [now, setNow] = useState(initialServerNow);

  useEffect(() => {
    const clientNow = Date.now();
    clientAnchorRef.current = clientNow;
    serverAnchorRef.current = parseServerNow(serverNowUtc) ?? clientNow;

    const intervalId = window.setInterval(() => {
      setNow(serverAnchorRef.current + (Date.now() - clientAnchorRef.current));
    }, tickMs);

    return () => window.clearInterval(intervalId);
  }, [serverNowUtc, tickMs]);

  return now;
}

export function LocalizedDateTimeText({
  value,
  fallback = '',
  options = { dateStyle: 'medium', timeStyle: 'short' } satisfies Intl.DateTimeFormatOptions,
  className,
}: {
  value: DateInput;
  fallback?: string;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const formatLocalDateTime = useLocalizedDateTimeFormatter();
  const isoString = toIsoString(value);

  return (
    <time dateTime={isoString} className={className}>
      {formatLocalDateTime(value, fallback, options)}
    </time>
  );
}

export function LocalizedTimeText({
  value,
  fallback = '',
  options = { timeStyle: 'short' } satisfies Intl.DateTimeFormatOptions,
  className,
}: {
  value: DateInput;
  fallback?: string;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const formatLocalTime = useLocalizedTimeFormatter();
  const isoString = toIsoString(value);

  return (
    <time dateTime={isoString} className={className}>
      {formatLocalTime(value, fallback, options)}
    </time>
  );
}
