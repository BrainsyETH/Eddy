/** One navigation per visit, even when two native presses arrive before React renders. */
export function createNavigationGate() {
  let opening = false;
  return {
    reset() {
      opening = false;
    },
    run(action: () => void) {
      if (opening) return;
      opening = true;
      try {
        action();
      } catch (error) {
        opening = false;
        throw error;
      }
    },
  };
}
