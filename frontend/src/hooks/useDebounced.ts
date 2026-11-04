import { useEffect, useState } from 'react';

/** Georef matches whole words, a little fuzzy: wait for the typing to settle before asking. */
export function useDebounced(value: string, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
