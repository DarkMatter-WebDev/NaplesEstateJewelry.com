import { cityLine, streetLine } from '@/lib/business-location';

interface Props {
  locale?: string;
  className?: string;
}

/**
 * The showroom address as a readable block, for any surface a visitor scans
 * rather than reads in a sentence.
 *
 * Street and city are separate `nowrap` runs, so if the line must break it
 * breaks after "Ste 104," rather than inside "Naples, FL 34109".
 *
 * ⛔ The second line (the shared-suite landmark) was removed on
 * 2026-11-25 (owner: proper signage now, "we are just as much the shop").
 * The `locale` prop is kept (unused) so callers need not change.
 */
export default function ShowroomAddress({ className = '' }: Props) {
  return (
    <span className={`block ${className}`}>
      <span className="block" style={{ fontWeight: 600 }}>
        <span style={{ whiteSpace: 'nowrap' }}>{streetLine()}</span>
        {', '}
        <span style={{ whiteSpace: 'nowrap' }}>{cityLine()}</span>
      </span>
    </span>
  );
}
