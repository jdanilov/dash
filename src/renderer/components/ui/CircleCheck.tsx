import React from 'react';
import { Check } from 'lucide-react';

interface CircleCheckProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function CircleCheck({
  checked,
  onChange,
  label,
  className = '',
  disabled = false,
}: CircleCheckProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`flex items-center gap-2.5 group text-left ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors duration-150 ${
          checked
            ? 'bg-primary border-primary'
            : disabled
              ? 'border-border/50 bg-transparent'
              : 'border-border bg-transparent group-hover:border-foreground/40'
        }`}
      >
        {checked && <Check size={10} strokeWidth={3} className="text-primary-foreground" />}
      </span>
      <span className="text-[13px] text-foreground/80 group-hover:text-foreground transition-colors">
        {label}
      </span>
    </button>
  );
}
