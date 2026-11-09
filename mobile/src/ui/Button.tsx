import React from 'react';
import {Pressable, PressableProps, StyleSheet, View} from 'react-native';
import {cva, type VariantProps} from 'class-variance-authority';
import {cn} from './cn';
import {TextClassContext} from './Text';

// RN Reusables Button, trimmed to the variants this app uses. Capsules only, no shadows, no outlines.
export const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-full active:opacity-70', {
  variants: {
    variant: {
      primary: 'bg-ink',
      secondary: 'bg-grouped',
      tinted: 'bg-raised',
      plain: 'bg-transparent',
      glass: 'bg-black/45',
    },
    size: {
      lg: 'h-[52px] px-6',
      md: 'h-11 px-5',
      sm: 'h-8 px-3',
    },
  },
  defaultVariants: {variant: 'secondary', size: 'md'},
});

export const buttonTextVariants = cva('font-semibold', {
  variants: {
    variant: {primary: 'text-black', secondary: 'text-ink', tinted: 'text-ink', plain: 'text-ink', glass: 'text-ink'},
    size: {lg: 'text-[17px] leading-[22px]', md: 'text-[16px] leading-[21px]', sm: 'text-[13px] leading-[18px]'},
    tone: {default: '', danger: 'text-danger', muted: 'text-subtle'},
  },
  defaultVariants: {variant: 'secondary', size: 'md', tone: 'default'},
});

type Props = PressableProps & VariantProps<typeof buttonVariants> & {
  className?: string; tone?: 'default' | 'danger' | 'muted'; children?: React.ReactNode;
};

export function Button({className, variant, size, tone, disabled, children, ...props}: Props) {
  return <TextClassContext.Provider value={buttonTextVariants({variant, size, tone})}>
    <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{disabled: !!disabled}}
      className={cn(buttonVariants({variant, size}), disabled && 'opacity-40', className)} {...props}>
      {typeof children === 'function' ? children : <>{children}</>}
    </Pressable>
  </TextClassContext.Provider>;
}

/** Round icon-only button. The visual can be smaller than 44; hitSlop keeps the touch target. */
export const roundVariants = cva('items-center justify-center rounded-full active:opacity-70', {
  variants: {
    tone: {
      filled: 'bg-grouped',
      glass: 'bg-black/45',
      inverted: 'bg-ink',
      plain: 'bg-transparent',
    },
  },
  defaultVariants: {tone: 'filled'},
});

type RoundProps = PressableProps & VariantProps<typeof roundVariants> & {className?: string; size?: number; children: React.ReactNode};

export function RoundButton({className, tone, size = 44, disabled, children, ...props}: RoundProps) {
  const slop = Math.max(0, (44 - size) / 2);
  return <Pressable accessibilityRole="button" disabled={disabled} hitSlop={slop}
    className={cn(roundVariants({tone}), disabled && 'opacity-40', className)} style={{width: size, height: size}} {...props}>
    {children}
  </Pressable>;
}

export function Separator({className}: {className?: string}) {
  return <View className={cn('bg-separator', className)} style={{height: StyleSheet.hairlineWidth}}/>;
}
