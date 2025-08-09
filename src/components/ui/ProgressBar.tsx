import React from 'react';
import { cn } from '../../lib/utils';

interface ProgressBarProps {
  value: number;
  max: number;
  className?: string;
  color?: 'blue' | 'green' | 'purple' | 'orange';
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export function ProgressBar({ 
  value, 
  max, 
  className, 
  color = 'blue', 
  size = 'md',
  showText = false 
}: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100);

  const colorStyles = {
    blue: 'bg-gradient-to-r from-blue-500 to-blue-600',
    green: 'bg-gradient-to-r from-green-500 to-green-600',
    purple: 'bg-gradient-to-r from-purple-500 to-purple-600',
    orange: 'bg-gradient-to-r from-orange-500 to-orange-600'
  };

  const sizeStyles = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4'
  };

  return (
    <div className={cn('space-y-1', className)}>
      {showText && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>{value}</span>
          <span>{max}</span>
        </div>
      )}
      <div className={cn('w-full bg-gray-200 rounded-full overflow-hidden', sizeStyles[size])}>
        <div
          className={cn('h-full transition-all duration-500 ease-out', colorStyles[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}