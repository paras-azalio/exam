import { useEffect, useRef } from 'react';

/**
 * Reusable "Escape = go back" hook for the admin portal.
 *
 * Registers a single document-level keydown listener that fires `handler`
 * whenever the Escape key is pressed. The handler is stored in a ref so the
 * listener never has to be re-attached when the callback identity changes.
 *
 * Behaviour notes:
 * - Respects `e.defaultPrevented` — if a nested component already handled the
 *   Escape (and called `preventDefault()`), this hook stays out of the way.
 * - Ignores auto-repeat (holding the key down) so a single press = one "back".
 * - Pass `enabled = false` to temporarily disable without unmounting.
 *
 * Scoped to the admin portal only — deliberately NOT used on the student exam
 * screen, where Escape is tied to fullscreen / violation handling.
 */
export function useEscapeKey(handler: (e: KeyboardEvent) => void, enabled = true): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.repeat) return;
      handlerRef.current(e);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

export default useEscapeKey;
