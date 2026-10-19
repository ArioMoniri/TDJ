"use client";
import { type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { whenIdle } from "@/lib/hooks";

let hydrated = typeof window === "undefined";
let pending: Promise<void> | null = null;
const untilIdle = () =>
  (pending ??= new Promise<void>((res) =>
    whenIdle(() => {
      hydrated = true;
      res();
    }, 1200),
  ));

function Gate({ children }: { children: ReactNode }) {
  // During hydration: suspend until the main thread is idle. React keeps the server HTML on screen and hydrates
  // this boundary in a task of its own once the promise settles, instead of in the page's one big hydration task.
  if (!hydrated) throw untilIdle();
  return <>{children}</>;
}

/**
 * Server-rendered content whose hydration can wait: the set-up form is on screen from the first paint, its hooks
 * attach when the browser has a gap. Interactions before that are replayed by React once the boundary hydrates.
 *
 * While the boundary is still dehydrated it must not receive an update (React would give up on the server HTML
 * and client-render it, blanking the form for a moment), so until then the very same element is returned on
 * every render; the live children take over once the idle promise has settled.
 */
export function LazyHydrate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(hydrated);
  const first = useRef(children);
  const dehydrated = useMemo(
    () => (
      <Suspense>
        <Gate>{first.current}</Gate>
      </Suspense>
    ),
    [],
  );
  useEffect(() => {
    if (ready) return;
    let alive = true;
    untilIdle().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [ready]);
  if (!ready) return dehydrated;
  return (
    <Suspense>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
