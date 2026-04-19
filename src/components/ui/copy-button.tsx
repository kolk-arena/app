'use client';

import { useEffect, useRef, useState } from 'react';
import type { CopyStatus } from '@/i18n/types';

type CopyButtonProps = {
  value: string;
  idleLabel: string;
  copiedLabel?: string;
  failedLabel?: string;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
};

export function CopyButton({
  value,
  idleLabel,
  copiedLabel = 'Copied',
  failedLabel = 'Copy failed',
  className = '',
  type = 'button',
}: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    let nextStatus: CopyStatus = 'copied';
    try {
      await navigator.clipboard.writeText(value);
      setStatus(nextStatus);
    } catch {
      nextStatus = 'failed';
      setStatus(nextStatus);
    } finally {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(
        () => setStatus('idle'),
        nextStatus === 'failed' ? 2500 : 2000,
      );
    }
  }

  const label =
    status === 'copied'
      ? copiedLabel
      : status === 'failed'
      ? failedLabel
      : idleLabel;

  return (
    <button type={type} onClick={handleCopy} className={className}>
      {label}
    </button>
  );
}
