import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: ReactNode;
  active?: boolean;
  badge?: string | number;
  size?: 'sm' | 'md';
}

export function IconButton({
  label,
  icon,
  active = false,
  badge,
  size = 'md',
  className = '',
  title,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button icon-button--${size} ${active ? 'is-active' : ''} ${className}`}
      aria-label={label}
      aria-pressed={active || undefined}
      title={title ?? label}
      {...props}
    >
      {icon}
      {badge !== undefined && <span className="icon-button__badge">{badge}</span>}
    </button>
  );
}
