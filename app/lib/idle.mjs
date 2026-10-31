// Lets the server stop itself when nobody is using it.
//
// The page polls the server every few seconds to notice hand edits, so "any
// request" cannot mean "someone is here". Callers touch() only for requests that
// come from a person (loading the page, clicking, typing) and never for the
// poll. check() runs on a timer and fires onIdle once the quiet time passes.

export function createIdleWatch({ idleMs, now = Date.now, onIdle }) {
  let last = now();
  let fired = false;
  return {
    touch() {
      last = now();
    },
    check() {
      if (!idleMs || idleMs <= 0 || fired) return;
      if (now() - last > idleMs) {
        fired = true;
        onIdle();
      }
    },
  };
}
