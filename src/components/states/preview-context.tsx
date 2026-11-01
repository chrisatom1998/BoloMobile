import { createContext, useContext, type PropsWithChildren } from 'react';

import { previewPhaseFor, type AshaPhase, type ContentPhase, type PreviewScreen } from '@/lib/screen-states';

type PreviewValue = {
  phase: string;
  screen: string;
};

const PreviewContext = createContext<PreviewValue | null>(null);

export function StatePreviewProvider({ children, phase, screen }: PropsWithChildren<PreviewValue>) {
  return <PreviewContext.Provider value={{ phase, screen }}>{children}</PreviewContext.Provider>;
}

export function usePreviewPhase(screen: PreviewScreen): ContentPhase | AshaPhase | null {
  const value = useContext(PreviewContext);
  if (!value) return null;
  return previewPhaseFor(screen, value.screen, value.phase);
}
