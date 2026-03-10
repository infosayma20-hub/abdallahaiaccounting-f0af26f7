import React, { createContext, useContext, useState, useEffect } from "react";

interface ReadOnlyContextType {
  isReadOnly: boolean;
  setReadOnly: (val: boolean) => void;
}

const ReadOnlyContext = createContext<ReadOnlyContextType>({
  isReadOnly: false,
  setReadOnly: () => {},
});

export const useReadOnly = () => useContext(ReadOnlyContext);

export const ReadOnlyProvider = ({ children }: { children: React.ReactNode }) => {
  const [isReadOnly, setReadOnly] = useState(() => {
    return localStorage.getItem("zidni_readonly_mode") === "true";
  });

  useEffect(() => {
    if (isReadOnly) {
      localStorage.setItem("zidni_readonly_mode", "true");
    } else {
      localStorage.removeItem("zidni_readonly_mode");
    }
  }, [isReadOnly]);

  return (
    <ReadOnlyContext.Provider value={{ isReadOnly, setReadOnly }}>
      {children}
    </ReadOnlyContext.Provider>
  );
};
