import { useEffect, useState } from "react";

/** True when the viewport is narrow enough to use the phone layout. */
export function useIsPhone(breakpoint = 720): boolean {
  const [isPhone, setIsPhone] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const onResize = () => setIsPhone(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isPhone;
}
