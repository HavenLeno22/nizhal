import { useEffect, useState } from 'react';
import type { Home } from './engine/home';
import { LangProvider } from './i18n';
import { encodeHome, homeFromLocation, StoreProvider, useStore } from './state/store';
import { SharedPrompt } from './ui/SharedPrompt';
import { Onboarding } from './ui/Onboarding';
import { Shell } from './ui/Shell';

function Root() {
  const { state, dispatch } = useStore();
  const [pending, setPending] = useState<Home | null>(null);

  // A shared link (#home=…) opens that home. If a different home is already saved, ask first.
  useEffect(() => {
    const shared = homeFromLocation();
    if (!shared) return;
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/forecast`);
    if (state.home && encodeHome(state.home) !== encodeHome(shared)) setPending(shared);
    else if (!state.home) dispatch({ type: 'setHome', home: shared });
    // Only on first load: the saved home is read once, before the link is applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    document.documentElement.lang = state.prefs.lang;
    if (state.prefs.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', state.prefs.theme);
  }, [state.prefs.lang, state.prefs.theme]);

  return (
    <LangProvider lang={state.prefs.lang}>
      {pending && (
        <SharedPrompt
          onOpen={() => {
            dispatch({ type: 'setHome', home: pending });
            setPending(null);
          }}
          onKeep={() => setPending(null)}
        />
      )}
      {state.home ? <Shell home={state.home} /> : <Onboarding />}
    </LangProvider>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Root />
    </StoreProvider>
  );
}
