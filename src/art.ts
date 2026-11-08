import type { Settlement } from "./types";

export function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function drawArt(canvas: HTMLCanvasElement, s: Settlement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width,
    random = seededRandom(s.transactionHash);
  const nap = BigInt(s.workAdded) === 0n;
  const energy = Math.min(1, Math.log2(Number(s.workAdded) + 1) / 12);
  const hue =
    (Number.parseInt(s.transactionHash.slice(-6), 16) +
      s.completedBlockCount * 13) %
    360;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = nap ? "#202b49" : `hsl(${hue} 52% 93%)`;
  ctx.fillRect(0, 0, size, size);
  if (nap) {
    for (let i = 0; i < 70; i++) {
      const x = random() * size,
        y = random() * size,
        r = 1 + random() * 2;
      ctx.fillStyle = `rgba(247,229,185,${0.2 + random() * 0.8})`;
      ctx.fillRect(x, y, r, r);
    }
    ctx.fillStyle = "#f0d6a7";
    ctx.beginPath();
    ctx.arc(size * 0.68, size * 0.3, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#202b49";
    ctx.beginPath();
    ctx.arc(size * 0.72, size * 0.27, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `hsl(${225 + i * 9} 30% ${26 + i * 5}%)`;
      ctx.beginPath();
      ctx.moveTo(0, size);
      for (let x = 0; x <= size; x += 4)
        ctx.lineTo(
          x,
          size * (0.7 + i * 0.06) + Math.sin((x / size) * 5 + i) * size * 0.06,
        );
      ctx.lineTo(size, size);
      ctx.fill();
    }
  } else {
    const count =
      45 + Math.floor(energy * 135) + Math.min(30, s.completedBlockCount);
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2,
        radius = (0.08 + random() * 0.4) * size;
      const x = size / 2 + Math.cos(angle) * radius,
        y = size / 2 + Math.sin(angle) * radius;
      ctx.strokeStyle = `hsla(${hue + random() * 90} ${55 + energy * 25}% ${35 + random() * 30}% / ${0.4 + random() * 0.5})`;
      ctx.lineWidth = ((1 + random() * 4) * size) / 360;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        size / 2,
        y + size * 0.25,
        x - size * 0.3,
        size / 2,
        x + Math.sin(angle) * size * 0.25,
        y + Math.cos(angle) * size * 0.2,
      );
      ctx.stroke();
    }
    for (let i = 0; i < 20 + energy * 50; i++) {
      ctx.fillStyle = `hsl(${hue + 90 + random() * 90} 75% 53%)`;
      const r = ((1 + random() * 4) * size) / 360;
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
