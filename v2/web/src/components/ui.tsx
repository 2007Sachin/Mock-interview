import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-strong border-transparent',
  secondary: 'bg-surface text-ink border-edge hover:bg-surface-muted',
  danger: 'bg-surface text-danger border-danger/40 hover:bg-danger-soft',
  ghost: 'bg-transparent text-ink-secondary border-transparent hover:bg-surface-muted',
};

const SIZE: Record<Size, string> = {
  md: 'px-5 py-2.5 text-sm rounded-lg',
  lg: 'px-8 py-3.5 text-base rounded-full',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    />
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`print-card rounded-xl border border-edge bg-surface p-7 shadow-[0_1px_3px_rgb(29_36_51/0.08),0_4px_16px_rgb(29_36_51/0.06)] ${className}`}>
      {children}
    </div>
  );
}

/**
 * Footer navigation bar used on every step screen: Back on the left,
 * the primary action on the right, so users always know how to move.
 */
export function NavBar({
  onBack,
  backLabel = 'Back',
  children,
}: {
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-7 flex items-center justify-between gap-3 border-t border-edge pt-5">
      <div>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            ← {backLabel}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}
