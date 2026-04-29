'use client';

import { useEffect, useRef, useState } from 'react';
import { copy } from '@/i18n';
import type { CopyStatus } from '@/i18n/types';

type CopyButtonProps = {
  value: string;
  idleLabel: string;
  copiedLabel?: string;
  failedLabel?: string;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
};

async function writeToClipboard(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the legacy execCommand path below.
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard API unavailable');
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand('copy');
  textarea.remove();

  if (!copied) {
    throw new Error('Copy failed');
  }
}

const DEFAULT_COPY_BUTTON_CLASSES =
  'action-button action-button-secondary action-button-sm focus-visible:outline-none';

export function CopyButton({
  value,
  idleLabel,
  copiedLabel = copy.common.copied,
  failedLabel = copy.common.copyFailed,
  className,
  type = 'button',
  disabled = false,
}: CopyButtonProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timeoutRef = useRef<number | null>(null);

  const finalClassName = className && className.trim().length > 0
    ? className
    : DEFAULT_COPY_BUTTON_CLASSES;

  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopy() {
    if (disabled) return;
    let nextStatus: CopyStatus = 'copied';
    try {
      await writeToClipboard(value);
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
    <button
      type={type}
      onClick={handleCopy}
      className={`${finalClassName} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      aria-live="polite"
      data-copy-state={status}
      title={label}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
