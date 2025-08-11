// src/components/ui/Card.tsx
import * as React from 'react';
import { cn } from '../../lib/utils';

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export interface CardProps extends DivProps {
  /** enables hover styling */
  hover?: boolean;
  /** extra background classes (gradient, image, etc.) */
  bgClass?: string;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover, bgClass, ...rest }, ref) => {
    // IMPORTANT: do NOT pass `hover` or `bgClass` to the DOM.
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl border bg-white shadow-sm',
          bgClass,                 // apply bg styles to className
          hover && 'transition hover:shadow-md', // apply hover effect via class
          className
        )}
        {...rest} // safe to spread the remainder
      />
    );
  }
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn('p-4', className)} {...rest} />
  )
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...rest }, ref) => (
    <h3 ref={ref} className={cn('text-base font-semibold', className)} {...rest} />
  )
);
CardTitle.displayName = 'CardTitle';

export const CardContent = React.forwardRef<HTMLDivElement, DivProps>(
  ({ className, ...rest }, ref) => (
    <div ref={ref} className={cn('p-4 pt-0', className)} {...rest} />
  )
);
CardContent.displayName = 'CardContent';

export { Card };
