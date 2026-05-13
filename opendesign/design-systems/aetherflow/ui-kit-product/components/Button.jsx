import React from 'react';

export const Button = React.forwardRef(({ className = '', variant = "default", ...props }, ref) => {
  let variantClass = "glass-button";
  if (variant === "primary") variantClass = "glass-button-primary";
  if (variant === "ghost") variantClass = "hover:bg-white/5 text-slate-300 hover:text-white";

  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 ${variantClass} ${className}`}
      {...props}
    />
  );
});
Button.displayName = "Button";
