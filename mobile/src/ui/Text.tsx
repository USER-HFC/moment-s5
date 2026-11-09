import React from 'react';
import {Text as RNText, TextProps} from 'react-native';
import {cn} from './cn';

/** RN Reusables pattern: a parent (a Button) can set the text classes of every child Text. */
export const TextClassContext = React.createContext<string | undefined>(undefined);

export function Text({className, maxFontSizeMultiplier = 1.3, ...props}: TextProps & {className?: string}) {
  const inherited = React.useContext(TextClassContext);
  return <RNText maxFontSizeMultiplier={maxFontSizeMultiplier} className={cn('text-body text-ink', inherited, className)} {...props}/>;
}
