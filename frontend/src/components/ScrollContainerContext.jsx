import { createContext, useContext, useRef } from "react";

const ScrollContainerContext = createContext(null);

export function ScrollContainerProvider({ children }) {
  const ref = useRef(null);
  return (
    <ScrollContainerContext.Provider value={ref}>
      {children}
    </ScrollContainerContext.Provider>
  );
}

export function useScrollContainer() {
  return useContext(ScrollContainerContext);
}
