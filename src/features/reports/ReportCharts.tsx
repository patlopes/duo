import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBRL } from '../../domain/money';

const AXIS = { fontSize: 11, fill: 'var(--color-text-secondary)' };
const GRID = 'var(--color-separator)';

/** Thousands are enough on an axis; the tooltip carries the exact value. */
function axisMoney(cents: number): string {
  const reais = cents / 100;
  if (Math.abs(reais) >= 1000)
    return `${(reais / 1000).toFixed(Math.abs(reais) >= 10000 ? 0 : 1).replace('.', ',')}k`;
  return String(Math.round(reais));
}

const tooltipProps = {
  formatter: (value: unknown) => formatBRL(Number(value)),
  contentStyle: {
    background: 'var(--color-surface)',
    border: '0.5px solid var(--color-separator)',
    borderRadius: 10,
    fontSize: 13,
    color: 'var(--color-text)',
  },
  labelStyle: { color: 'var(--color-text-secondary)' },
  cursor: { fill: 'var(--color-primary-tint)', stroke: 'var(--color-separator)' },
};

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

export function GroupedBars({
  rows,
  series,
  hidden,
  onPick,
}: {
  rows: Record<string, number | string>[];
  series: SeriesDef[];
  hidden: boolean;
  onPick?: (index: number) => void;
}) {
  const pick = (state: unknown) => {
    const index = Number((state as { activeTooltipIndex?: unknown } | null)?.activeTooltipIndex);
    if (Number.isInteger(index)) onPick?.(index);
  };
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          barGap={2}
          margin={{ top: 8, right: 4, left: -14, bottom: 0 }}
          onClick={pick}
        >
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            tickFormatter={hidden ? () => '' : axisMoney}
            width={44}
          />
          {!hidden && <Tooltip {...tooltipProps} />}
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color}
              radius={[4, 4, 0, 0]}
              maxBarSize={14}
              isAnimationActive
              animationDuration={700}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Lines({
  rows,
  series,
  hidden,
  onPick,
}: {
  rows: Record<string, number | string>[];
  series: SeriesDef[];
  hidden: boolean;
  onPick?: (index: number) => void;
}) {
  const pick = (state: unknown) => {
    const index = Number((state as { activeTooltipIndex?: unknown } | null)?.activeTooltipIndex);
    if (Number.isInteger(index)) onPick?.(index);
  };
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -14, bottom: 0 }} onClick={pick}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis
            tick={AXIS}
            axisLine={false}
            tickLine={false}
            tickFormatter={hidden ? () => '' : axisMoney}
            width={44}
          />
          {!hidden && <Tooltip {...tooltipProps} />}
          {series.length > 1 && (
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          )}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
              isAnimationActive
              animationDuration={900}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
