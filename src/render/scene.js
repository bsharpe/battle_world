export function createLineBuffer(max = 32768) {
  const data = new Float32Array(max * 5);
  return {
    data,
    count: 0,
    push(x0, y0, x1, y1, intensity) {
      if (this.count >= max) return;
      const o = this.count++ * 5;
      data[o] = x0; data[o + 1] = y0; data[o + 2] = x1; data[o + 3] = y1; data[o + 4] = intensity;
    },
    clear() { this.count = 0; },
  };
}
