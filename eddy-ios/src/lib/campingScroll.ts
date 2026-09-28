/** A pan ending over a row must never activate its detail sheet. */
export function createCampingTapGuard() {
  let origin = { x: 0, y: 0 };
  let moved = false;
  return {
    start(x: number, y: number) {
      origin = { x, y };
      moved = false;
    },
    move(x: number, y: number) {
      if (Math.abs(x - origin.x) > 8 || Math.abs(y - origin.y) > 8)
        moved = true;
    },
    cancel() {
      moved = true;
    },
    allowed() {
      return !moved;
    },
  };
}
