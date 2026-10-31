// Decides when the page calls the server "gone". One rejected request is a
// hiccup and changes nothing; three in a row, with no answer between them, show
// the stopped panel. Any answer at all, even an HTTP error, clears the count.

export const FAILURES_BEFORE_STOPPED = 3;

export const initialLiveness = () => ({ failures: 0, stopped: false });

// event: "fail" (a request got no answer) or "ok" (a request got any answer).
export function nextLiveness(state, event, threshold = FAILURES_BEFORE_STOPPED) {
  if (event === "ok") {
    return state.failures === 0 && !state.stopped ? state : { failures: 0, stopped: false };
  }
  if (event === "fail") {
    const failures = state.failures + 1;
    return { failures, stopped: state.stopped || failures >= threshold };
  }
  return state;
}
