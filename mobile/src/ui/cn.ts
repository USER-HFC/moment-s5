import {clsx, type ClassValue} from 'clsx';
import {extendTailwindMerge} from 'tailwind-merge';

// The custom type scale (text-title, text-footnote…) must be known as font sizes,
// or tailwind-merge takes it for a colour and drops text-ink.
const twMerge = extendTailwindMerge({
  extend: {classGroups: {'font-size': [{text: ['caption', 'footnote', 'body', 'headline', 'title', 'large']}]}},
});

/** RN Reusables helper: later classes win, so callers can override a variant. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
