import type { CategorySlice } from '../domain/summaries';

/**
 * Hand-drawn instead of Recharts because this one renders on the first screen, and Recharts alone
 * would cost more than the whole first-paint budget has left. The Reports screen uses Recharts.
 */
export function Donut({
  slices,
  size = 132,
  label,
}: {
  slices: Pick<CategorySlice, 'color' | 'share' | 'name'>[];
  size?: number;
  label: string;
}) {
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // A 2px gap keeps neighbors apart without a border color that would have to follow the theme.
  const gap = slices.length > 1 ? 2 : 0;
  const offsets = slices.map((_, i) =>
    slices.slice(0, i).reduce((sum, s) => sum + s.share * circumference, 0),
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {slices.map((s, i) => {
          const dash = Math.max(0, s.share * circumference - gap);
          return (
            <circle
              key={s.name}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offsets[i]!}
            />
          );
        })}
      </g>
    </svg>
  );
}
