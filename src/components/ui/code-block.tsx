'use client';

import type { ReactNode } from 'react';
import { CopyButton } from '@/components/ui/copy-button';

type CodeBlockProps = {
  code: string;
  title?: string;
  eyebrow?: string;
  copyValue?: string;
  copyLabel?: string;
  copiedLabel?: string;
  failedLabel?: string;
  actions?: ReactNode;
  tone?: 'dark' | 'light';
  wrap?: boolean;
  className?: string;
};

export function CodeBlock({
  code,
  title,
  eyebrow,
  copyValue,
  copyLabel,
  copiedLabel,
  failedLabel,
  actions,
  tone = 'dark',
  wrap = true,
  className = '',
}: CodeBlockProps) {
  const containerClasses =
    tone === 'dark'
      ? 'border-2 border-slate-950 bg-slate-950 text-slate-100'
      : 'border-2 border-slate-950 bg-slate-50 text-slate-900';
  const mutedClasses = tone === 'dark' ? 'text-slate-300' : 'text-slate-600';
  const preClasses = tone === 'dark' ? 'text-slate-100' : 'text-slate-800';
  const buttonClasses =
    tone === 'dark'
      ? 'inline-flex min-h-9 items-center rounded-md border-2 border-white/30 bg-white/10 px-3 py-1.5 text-xs font-mono font-semibold text-slate-100 transition-colors duration-150 hover:bg-white hover:text-slate-950'
      : 'inline-flex min-h-9 items-center rounded-md border-2 border-slate-950 bg-white px-3 py-1.5 text-xs font-mono font-semibold text-slate-950 transition-colors duration-150 hover:bg-slate-950 hover:text-white';
  const headerBorderClasses = tone === 'dark' ? 'border-b-2 border-white/20' : 'border-b-2 border-slate-950';

  return (
    <div className={`overflow-hidden rounded-md ${containerClasses} ${className}`}>
      {title || eyebrow || actions || copyValue ? (
        <div className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5 ${headerBorderClasses}`}>
          <div className="min-w-0">
            {eyebrow ? (
              <p className={`font-mono text-[11px] font-semibold uppercase tracking-[0.18em] ${mutedClasses}`}>
                {eyebrow}
              </p>
            ) : null}
            {title ? <p className="mt-1 font-mono text-sm font-semibold">{title}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            {copyValue && copyLabel ? (
              <CopyButton
                value={copyValue}
                idleLabel={copyLabel}
                copiedLabel={copiedLabel}
                failedLabel={failedLabel}
                className={buttonClasses}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <pre
        className={`overflow-x-auto px-4 py-4 font-mono text-[12px] leading-6 sm:px-5 sm:py-5 sm:text-[13px] ${preClasses} ${
          wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
        }`}
      >
        {code}
      </pre>
    </div>
  );
}
