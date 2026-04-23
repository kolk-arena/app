import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';

export type QuickActionButtonVariant = 'primary' | 'secondary';
export type QuickActionButtonTone = 'mono' | 'sans';
export type QuickActionButtonSize = 'sm' | 'md' | 'lg';
export type QuickActionButtonWidth = 'auto' | 'stack' | 'full';

export function getQuickActionButtonClassName({
  variant = 'secondary',
  tone = 'sans',
  size = 'md',
  width = 'stack',
  className = '',
}: {
  variant?: QuickActionButtonVariant;
  tone?: QuickActionButtonTone;
  size?: QuickActionButtonSize;
  width?: QuickActionButtonWidth;
  className?: string;
}) {
  const variantClasses =
    variant === 'primary'
      ? 'border border-slate-200 bg-slate-950 text-white hover:bg-white hover:text-slate-950'
      : 'border border-slate-200 bg-white text-slate-950 hover:bg-slate-950 hover:text-white';
  const toneClasses = tone === 'sans' ? 'font-medium' : 'font-mono font-semibold';
  const sizeClasses =
    size === 'sm'
      ? 'min-h-10 px-3 py-1.5 text-xs'
      : size === 'lg'
      ? 'min-h-12 px-6 py-3 text-sm'
      : 'min-h-11 px-4 py-2.5 text-sm';
  const widthClasses =
    width === 'full' ? 'w-full' : width === 'auto' ? '' : 'w-full sm:w-auto';

  return [
    'inline-flex items-center justify-center rounded-xl transition-colors duration-150',
    'focus-visible:outline-none focus-gentle',
    variantClasses,
    toneClasses,
    sizeClasses,
    widthClasses,
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

type SharedProps = {
  children: ReactNode;
  variant?: QuickActionButtonVariant;
  tone?: QuickActionButtonTone;
  size?: QuickActionButtonSize;
  width?: QuickActionButtonWidth;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

type ButtonProps = SharedProps & {
  href?: never;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
};

type LinkProps = SharedProps & {
  href: string;
  onClick?: never;
  type?: never;
  target?: string;
  rel?: string;
  download?: string;
};

function isLinkProps(props: ButtonProps | LinkProps): props is LinkProps {
  return typeof (props as LinkProps).href === 'string';
}

export function QuickActionButton(props: ButtonProps | LinkProps) {
  const {
    children,
    variant = 'secondary',
    tone = 'sans',
    size = 'md',
    width = 'stack',
    className,
    ariaLabel,
    disabled = false,
  } = props;

  const finalClassName = getQuickActionButtonClassName({
    variant,
    tone,
    size,
    width,
    className,
  });

  if (isLinkProps(props)) {
    const { href, target, rel, download } = props;
    const commonProps = {
      className: `${finalClassName} ${disabled ? 'pointer-events-none opacity-50' : ''}`,
      'aria-label': ariaLabel,
    };

    if (href.startsWith('/')) {
      return (
        <Link href={href} {...commonProps}>
          {children}
        </Link>
      );
    }

    return (
      <a
        href={href}
        target={target}
        rel={rel}
        download={download}
        {...commonProps}
      >
        {children}
      </a>
    );
  }

  const { onClick, type = 'button' } = props;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${finalClassName} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {children}
    </button>
  );
}
