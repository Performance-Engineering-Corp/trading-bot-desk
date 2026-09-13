import { memo } from 'react';

type Props = {
  label: string;
  used: number;
  cap: number;
  text: string;
};

function MeterInner({ label, used, cap, text }: Props) {
  const pct = cap > 0 ? Math.min(100, Math.max(0, (used / cap) * 100)) : 0;
  let tone = 'from-desk-blue to-desk-purple';
  if (pct >= 90) tone = 'from-desk-red to-desk-red';
  else if (pct >= 70) tone = 'from-desk-amber to-desk-red';

  return (
    <div className="mb-2.5">
      <div className="mb-1 flex justify-between text-[0.8rem]">
        <span className="text-desk-text/90">{label}</span>
        <span className="font-mono text-desk-text/80">{text}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-[#1c2736] bg-[#0a1018]">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-500`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

export const Meter = memo(MeterInner);
