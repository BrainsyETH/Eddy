type ScrollTarget = {
  scrollTo: (options: { x: number; animated: boolean }) => void;
};
/** Imperative native scroll coordination; follower events never drive the group. */
export function createCampingScroll() {
  let x = 0;
  let driver: ScrollTarget | null = null;
  const views = new Set<ScrollTarget>();
  const restore = (view: ScrollTarget | null) =>
    view?.scrollTo({ x, animated: false });
  return {
    restore,
    register(view: ScrollTarget) {
      views.add(view);
      restore(view);
      return () => {
        views.delete(view);
        if (driver === view) driver = null;
      };
    },
    begin(view: ScrollTarget | null) {
      driver = view;
    },
    scroll(view: ScrollTarget | null, offset: number) {
      if (!view || view !== driver) return;
      x = Math.max(0, offset);
      for (const other of views) if (other !== view) restore(other);
    },
  };
}
