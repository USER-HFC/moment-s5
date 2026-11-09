import React from 'react';
import {Text as RNText, TextProps} from 'react-native';
import {cn} from './cn';
import {AnimatedText} from './motion';

/** RN Reusables pattern: a parent (a Button) can set the text classes of every child Text. */
export const TextClassContext = React.createContext<string | undefined>(undefined);

/** animated: render a Reanimated Text so an animated style (colour) can be passed in style. */
export function Text({className, maxFontSizeMultiplier = 1.3, animated = false, ...props}: TextProps & {className?: string; animated?: boolean; style?: unknown}) {
  const inherited = React.useContext(TextClassContext);
  const Component = (animated ? AnimatedText : RNText) as typeof RNText;
  return <Component maxFontSizeMultiplier={maxFontSizeMultiplier} className={cn('text-body text-ink', inherited, className)} {...props}/>;
}
