import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';

export type QuickActionButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger';
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
      ? 'action-button-slate'
      : variant === 'accent'
      ? 'action-button-accent'
      : variant === 'danger'
      ? 'action-button-danger'
      : 'action-button-secondary';
  const toneClasses = tone === 'sans' ? '' : 'font-mono font-semibold';
  const sizeClasses =
    size === 'sm'
      ? 'action-button-sm'
      : size === 'lg'
      ? 'action-button-lg'
      : 'action-button-md';
  const widthClasses =
    width === 'full' ? 'w-full' : width === 'auto' ? '' : 'w-full sm:w-auto';

  return [
    'action-button',
    'focus-visible:outline-none',
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
