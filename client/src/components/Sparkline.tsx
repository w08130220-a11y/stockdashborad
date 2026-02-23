interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
}

export function Sparkline({ data, color = "var(--color-stock-green)", width = 80, height = 28, strokeWidth = 1.8 }: SparklineProps) {
  if (!data || data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const w = width;
  const h = height - pad * 2;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = pad + h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Fill area under line
  const firstX = "0";
  const lastX = w.toFixed(1);
  const baseY = (pad + h).toFixed(1);
  const firstPt = `0,${(pad + h - ((data[0] - min) / range) * h).toFixed(1)}`;
  const lastPt = `${lastX},${(pad + h - ((data[data.length - 1] - min) / range) * h).toFixed(1)}`;
  const fillPoints = `${firstPt} ${points} ${lastPt} ${lastX},${baseY} ${firstX},${baseY}`;

  const isUp = data[data.length - 1] >= data[0];
  const fillColor = isUp ? "var(--color-stock-green)" : "var(--color-stock-red)";
  const lineColor = color === "auto" ? fillColor : color;

  return (
    <svg width={width} height={height} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${width}-${height}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill={`url(#sg-${width}-${height})`} />
      <polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
