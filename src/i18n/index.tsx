import { createContext, useContext, type ReactNode } from 'react';
import { en, type Messages } from './en';
import { hi } from './hi';
import { ta } from './ta';

export type Lang = 'en' | 'ta' | 'hi';
export const LANGS: Lang[] = ['en', 'ta', 'hi'];
export const MESSAGES: Record<Lang, Messages> = { en, ta, hi };
/** Intl locale for dates and numbers. Indian digit grouping everywhere. */
export const LOCALE: Record<Lang, string> = { en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN' };

const LangContext = createContext<Lang>('en');

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useT(): Messages {
  return MESSAGES[useContext(LangContext)];
}

export type { Messages };
