import { formatFollowUpTime, WAIT_REASON_LABELS, type FollowUpSettings, stepEnabled } from '@/lib/follow-ups';
import type { FollowUpMessageRow } from '@/lib/follow-ups-server';
import type { Tone } from './shared';

/** What a row in Upcoming says in its "Sends" column. */
export function upcomingStatus(row: FollowUpMessageRow, settings: FollowUpSettings): { tone: Tone; text: string } {
  if (row.status === 'sending') return { tone: 'wait', text: 'Sending…' };
  if (row.status === 'waiting') return { tone: 'muted', text: `◷ ${WAIT_REASON_LABELS[row.wait_reason ?? 'pickup']}` };
  const when = formatFollowUpTime(row.send_at);
  if (!stepEnabled(settings, row.audience, row.step)) return { tone: 'muted', text: `Off — holds until step ${row.step} is turned on (${when})` };
  if (!settings.autoSend) return { tone: 'muted', text: `Paused — ${when}` };
  if (row.send_at && new Date(row.send_at).getTime() <= Date.now()) return { tone: 'wait', text: '● Going out in the next few minutes' };
  return { tone: 'wait', text: `● ${when}` };
}

/** What a row in the Sent log says in its "Result" column. */
export function messageResult(row: FollowUpMessageRow): { tone: Tone; text: string } {
  switch (row.status) {
    case 'sent': {
      const by = row.sent_by_email ? ` (sent now by ${row.sent_by_email})` : '';
      const click = row.review_clicked_at ? ` · clicked review link ${formatFollowUpTime(row.review_clicked_at)}` : '';
      return { tone: 'ok', text: `✓ Sent ${formatFollowUpTime(row.sent_at)}${by}${click}` };
    }
    case 'skipped':
      return { tone: 'muted', text: `— ${row.reason ?? 'Skipped.'}` };
    case 'not_sent':
      return { tone: 'muted', text: `— Not sent: ${row.reason ?? ''}`.trim() };
    case 'cancelled':
      return { tone: 'muted', text: `— Called off: ${row.reason ?? ''}`.trim() };
    case 'failed':
      return { tone: 'bad', text: `✕ Failed: ${row.reason ?? 'unknown error'}` };
    case 'waiting':
      return { tone: 'muted', text: `◷ ${WAIT_REASON_LABELS[row.wait_reason ?? 'pickup']}` };
    case 'scheduled':
      return { tone: 'wait', text: `● Scheduled ${formatFollowUpTime(row.send_at)}` };
    default:
      return { tone: 'wait', text: 'Sending…' };
  }
}
