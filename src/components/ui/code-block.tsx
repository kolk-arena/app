'use client';

import Prism from 'prismjs';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-yaml';
import { useMemo, type ReactNode } from 'react';
import { CopyButton } from '@/components/ui/copy-button';
import { getQuickActionButtonClassName } from '@/components/ui/quick-action-button';

export type CodeBlockLanguage =
  | 'text'
  | 'bash'
  | 'javascript'
  | 'json'
  | 'markdown'
  | 'python'
  | 'typescript'
  | 'yaml';

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
  language?: CodeBlockLanguage;
  mobileChrome?: 'default' | 'subtle';
  ariaLabel?: string;
};

function resolveLanguage(language: CodeBlockLanguage): Exclude<CodeBlockLanguage, 'text'> | null {
  if (language === 'text') return null;
  return language;
}

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
  language = 'text',
  mobileChrome = 'default',
  ariaLabel,
}: CodeBlockProps) {
  const containerClasses =
    mobileChrome === 'subtle'
      ? tone === 'dark'
        ? 'border-0 bg-slate-950 text-slate-100 sm:border sm:border-slate-200'
        : 'border-0 bg-slate-50 text-slate-900 sm:border sm:border-slate-200'
      : tone === 'dark'
      ? 'border border-slate-200 bg-slate-950 text-slate-100'
      : 'border border-slate-200 bg-slate-50 text-slate-900';
  const mutedClasses = tone === 'dark' ? 'text-slate-300' : 'text-slate-600';
  const preClasses = tone === 'dark' ? 'text-slate-100' : 'text-slate-800';
  // Dark-tone code blocks need a dark-surface action button; keep that as
  // a named design-system variant instead of stacking conflicting utilities.
  const buttonClasses =
    tone === 'dark'
      ? [
          'action-button action-button-dark action-button-sm focus-visible:outline-none',
          'font-mono font-semibold',
        ].join(' ')
      : getQuickActionButtonClassName({
          variant: 'secondary',
          tone: 'mono',
          size: 'sm',
          width: 'auto',
        });
  const headerBorderClasses =
    mobileChrome === 'subtle'
      ? tone === 'dark'
        ? 'border-b-0 sm:border-b sm:border-white/20'
        : 'border-b-0 sm:border-b sm:border-slate-200'
      : tone === 'dark'
      ? 'border-b border-white/20'
      : 'border-b border-slate-200';
  const resolvedLanguage = resolveLanguage(language);
  const highlightedCode = useMemo(() => {
    if (!resolvedLanguage) {
      return Prism.util.encode(code).toString();
    }

    const grammar = (Prism.languages as Record<string, unknown>)[resolvedLanguage];
    if (!grammar) {
      return Prism.util.encode(code).toString();
    }

    return Prism.highlight(code, grammar as Prism.Grammar, resolvedLanguage);
  }, [code, resolvedLanguage]);
  const languageClassName = resolvedLanguage ? `language-${resolvedLanguage}` : 'language-text';

  return (
    <div className={`code-block-shell overflow-hidden rounded-xl ${tone === 'dark' ? 'code-block-shell-dark' : 'code-block-shell-light'} ${containerClasses} ${className}`}>
      {title || eyebrow || actions || copyValue ? (
        <div className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5 ${headerBorderClasses}`}>
          <div className="min-w-0 break-words [overflow-wrap:anywhere]">
            {eyebrow ? (
              <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${mutedClasses}`}>
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
        tabIndex={0}
        aria-label={ariaLabel ?? title ?? eyebrow ?? 'Code block'}
        suppressHydrationWarning
        className={`overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent px-4 py-4 font-mono text-[12px] leading-6 sm:px-5 sm:py-5 sm:text-[13px] ${preClasses} ${
          wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
        }`}
      >
        <code
          className={`code-block-content block ${languageClassName}`}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
    </div>
  );
}
