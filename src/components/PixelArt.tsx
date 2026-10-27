import { memo, useMemo } from "react";

/* ── colour helpers ─────────────────────────────────────────── */
function hex2rgb(h: string): [number, number, number] {
  const s = h.replace("#", "");
  const v = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = hex2rgb(a);
  const [r2, g2, b2] = hex2rgb(b);
  const c = (x: number, y: number) =>
    Math.max(0, Math.min(255, Math.round(x + (y - x) * t)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

interface Props {
  art: string[];
  pal: Record<string, string>;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** dark silhouette pass around the sprite */
  outline?: boolean;
  /** top-lit bevel: lit upper faces, shaded lower faces */
  shade?: boolean;
  /** chars that emit light — crisp pixel halo behind, bright core on top */
  glow?: string[];
  /** faint specimen-card backing */
  card?: boolean;
}

const EMPTY_GLOW: string[] = [];

/**
 * Renders a 16x16 character matrix as run-length-merged crisp SVG rects,
 * with silhouette outline, top-lit bevel shading, and radiant bioluminescent glow.
 * Clean, heroic specimen icons without distracting needle graphics.
 */
export const PixelArt = memo(function PixelArt({
  art,
  pal,
  size = 48,
  className = "",
  style,
  outline = true,
  shade = true,
  glow = EMPTY_GLOW,
  card = false,
}: Props) {
  const W = useMemo(() => art.reduce((m, r) => Math.max(m, r.length), 16), [art]);
  const H = art.length;
  const glowKey = glow.join("");

  const { bg, halo, body, lit } = useMemo(() => {
    const glowSet = new Set(glowKey.split(""));
    const at = (x: number, y: number) =>
      y >= 0 && y < H && x >= 0 && x < art[y].length ? art[y][x] : ".";
    const solid = (x: number, y: number) => {
      const c = at(x, y);
      return c !== "." && c !== " " && !!pal[c];
    };

    const bg: React.ReactElement[] = [];
    const halo: React.ReactElement[] = [];
    const body: React.ReactElement[] = [];
    const lit: React.ReactElement[] = [];

    if (card) {
      bg.push(
        <rect
          key="card"
          x={-0.8}
          y={-0.8}
          width={W + 1.6}
          height={H + 1.6}
          fill="#120E0A"
          stroke="#3B322A"
          strokeWidth={0.35}
          rx={0.5}
        />
      );
    }

    // Run-length merged silhouette pass for hard cartoon/pixel edge
    if (outline) {
      for (let y = -1; y <= H; y++) {
        let runStart = -999;
        let runLen = 0;
        for (let x = -1; x <= W + 1; x++) {
          const isOut =
            x <= W &&
            !solid(x, y) &&
            (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1));
          if (isOut) {
            if (runLen === 0) runStart = x;
            runLen++;
          } else if (runLen > 0) {
            bg.push(<rect key={`o${runStart}-${y}`} x={runStart} y={y} width={runLen} height={1} fill="#090705" />);
            runLen = 0;
          }
        }
      }
    }

    // Body + top-lit bevel shading + crisp glow pass
    for (let y = 0; y < H; y++) {
      let runStart = 0;
      let runLen = 0;
      let runFill = "";
      const row = art[y];

      for (let x = 0; x <= row.length; x++) {
        const ch = x < row.length ? row[x] : ".";
        const base = ch !== "." && ch !== " " ? pal[ch] : undefined;
        let fill = "";

        if (base) {
          fill = base;
          if (shade) {
            const up = !solid(x, y - 1);
            const dn = !solid(x, y + 1);
            const lf = !solid(x - 1, y);
            const rt = !solid(x + 1, y);
            if (up) fill = mix(fill, "#FFFFFF", 0.22);
            else if (lf) fill = mix(fill, "#FFFFFF", 0.08);
            if (dn) fill = mix(fill, "#000000", 0.28);
            else if (rt) fill = mix(fill, "#000000", 0.12);
          }

          if (glowSet.has(ch)) {
            const bright = mix(base, "#FFFFFF", 0.5);
            halo.push(
              <rect
                key={`h${x}-${y}`}
                x={x - 0.55}
                y={y - 0.55}
                width={2.1}
                height={2.1}
                fill={base}
                opacity={0.32}
              />
            );
            lit.push(<rect key={`g${x}-${y}`} x={x} y={y} width={1} height={1} fill={bright} />);
          }
        }

        if (fill && fill === runFill) {
          runLen++;
        } else {
          if (runLen > 0) {
            body.push(
              <rect key={`b${runStart}-${y}`} x={runStart} y={y} width={runLen} height={1} fill={runFill} />
            );
          }
          if (fill) {
            runStart = x;
            runLen = 1;
            runFill = fill;
          } else {
            runLen = 0;
            runFill = "";
          }
        }
      }
    }

    return { bg, halo, body, lit };
  }, [art, pal, W, H, outline, shade, glowKey, card]);

  const vb = `${-1.5} ${-1.5} ${W + 3} ${H + 3}`;

  return (
    <svg
      viewBox={vb}
      width={size}
      height={size}
      className={className}
      style={style}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {bg}
      {halo}
      {body}
      {lit}
    </svg>
  );
});
