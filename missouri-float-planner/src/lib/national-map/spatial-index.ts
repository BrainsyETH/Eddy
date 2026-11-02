// src/lib/national-map/spatial-index.ts
// A uniform grid over layout-frame points, for hit testing ~14,000 marks on
// every pointer move without scanning them all.

export class GridIndex {
  private readonly cell: number;
  private readonly cells = new Map<number, number[]>();

  constructor(
    private readonly xs: ArrayLike<number>,
    private readonly ys: ArrayLike<number>,
    cellSize = 8,
  ) {
    this.cell = cellSize;
    for (let i = 0; i < xs.length; i++) {
      const key = this.key(Math.floor(xs[i] / cellSize), Math.floor(ys[i] / cellSize));
      const list = this.cells.get(key);
      if (list) list.push(i);
      else this.cells.set(key, [i]);
    }
  }

  private key(cx: number, cy: number): number {
    // Layout coordinates live in roughly [-200, 1400]; offset keeps keys positive.
    return (cx + 1000) * 100_000 + (cy + 1000);
  }

  /**
   * Indices within `radius` of (x, y), nearest first. `accept` filters to the
   * marks actually drawn in the current view.
   */
  near(x: number, y: number, radius: number, accept?: (i: number) => boolean): number[] {
    const out: Array<[number, number]> = [];
    const r2 = radius * radius;
    const x0 = Math.floor((x - radius) / this.cell);
    const x1 = Math.floor((x + radius) / this.cell);
    const y0 = Math.floor((y - radius) / this.cell);
    const y1 = Math.floor((y + radius) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(this.key(cx, cy));
        if (!list) continue;
        for (const i of list) {
          const d = (this.xs[i] - x) ** 2 + (this.ys[i] - y) ** 2;
          if (d <= r2 && (!accept || accept(i))) out.push([i, d]);
        }
      }
    }
    return out.sort((a, b) => a[1] - b[1]).map(([i]) => i);
  }
}
