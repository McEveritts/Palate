import React from 'react';

export const Input = React.forwardRef(({ className = '', type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={`flex h-10 w-full glass-input px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";
