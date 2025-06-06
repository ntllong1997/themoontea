import React from 'react';

export function Button({
  children,
  onClick,
  variant = 'default',
  size = 'md',
  className = '',
  ...props
}) {
  const baseStyle =
    'rounded px-4 py-2 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-blue-600 text-blue-600 hover:bg-blue-100',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
  };
  const sizes = {
    sm: 'text-sm px-3 py-1',
    md: 'text-md',
    lg: 'text-lg px-6 py-3',
  };

  return (
    <button
      onClick={onClick}
      className={`${baseStyle} ${variants[variant] || variants.default} ${
        sizes[size] || sizes.md
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
