export function fmtMoney(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return (
    sign +
    Number(n).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  );
}

export function fmtNum(n: number | null | undefined, digits = 4): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function clsPnL(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return 'neu';
  if (n > 1e-8) return 'pos';
  if (n < -1e-8) return 'neg';
  return 'neu';
}

export function shortTs(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour12: false });
  } catch {
    return iso;
  }
}

export function shortDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}
