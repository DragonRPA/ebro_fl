import React, { createContext, useContext } from 'react';

const PageActivityContext = createContext<boolean>(true);

export const PageActivityProvider: React.FC<{
  active: boolean;
  children: React.ReactNode;
}> = ({ active, children }) => (
  <PageActivityContext.Provider value={active}>{children}</PageActivityContext.Provider>
);

export function usePageActive(): boolean {
  return useContext(PageActivityContext);
}
