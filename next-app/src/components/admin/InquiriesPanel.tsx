'use client';

import { useState } from 'react';
import Image from 'next/image';
import {
  formatLocation,
  isOutsideServiceArea,
  parseLocationArea,
  parsePreferredContact,
  preferredContactLabel,
} from '@/lib/inquiry-fields';
import { hasAdClick } from '@/lib/ads-tracking';

const GOLD = '#735c00';
const BORDER = 'rgba(115,92,0,0.2)';

export interface Inquiry {
  id: string;
  item_title: string;
  name: string;
  phone: string;
  email: string | null;
  message: string;
  status: 'new' | 'read' | 'replied';
  created_at: string;
  uploaded_image_urls?: string[] | null;
  /** 2026-09-08 — absent on rows older than the migration. */
  location_area?: string | null;
  location_detail?: string | null;
  preferred_contact?: string | null;
  /** 2026-10-02 — the Google Ads click the sender arrived with; absent on other rows. */
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
}

/** The sender arrived from a Google ad (a click ID was saved with the lead). */
function cameFromGoogleAd(inquiry: Inquiry): boolean {
  return hasAdClick({
    gclid: inquiry.gclid ?? undefined,
    gbraid: inquiry.gbraid ?? undefined,
    wbraid: inquiry.wbraid ?? undefined,
  });
}

/**
 * The facts the owner asked for, first in the expanded card: how the sender
 * wants to be reached, where they are (red when outside Southwest Florida),
 * and whether they came from a Google ad. Older rows have none and render
 * nothing.
 */
function PreferenceChips({ inquiry }: { inquiry: Inquiry }) {
  const area = parseLocationArea(inquiry.location_area);
  const preferred = parsePreferredContact(inquiry.preferred_contact);
  const location = formatLocation(area, inquiry.location_detail ?? null);
  const fromAd = cameFromGoogleAd(inquiry);
  if (!preferred && !location && !fromAd) return null;
  const chip = (text: string, warn: boolean) => (
    <span
      style={{
        display: 'inline-block',
        fontSize: '0.65rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '0.15rem 0.55rem',
        borderRadius: 999,
        background: warn ? '#fde8e8' : '#f7efd7',
        color: warn ? '#b91c1c' : GOLD,
        marginRight: '0.4rem',
        marginBottom: '0.25rem',
      }}
    >
      {text}
    </span>
  );
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      {preferred && chip(`Prefers · ${preferredContactLabel(preferred, false)}`, false)}
      {location && chip(isOutsideServiceArea(area) ? `Outside SWFL · ${inquiry.location_detail?.trim() || 'location not given'}` : location, isOutsideServiceArea(area))}
      {fromAd && chip('Google Ad', false)}
    </div>
  );
}

function imageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

interface Props {
  inquiries: Inquiry[];
}

const STATUS_COLORS: Record<string, string> = {
  new: '#b91c1c',
  read: '#735c00',
  replied: '#166534',
};

export default function InquiriesPanel({ inquiries: initial }: Props) {
  const [items, setItems] = useState<Inquiry[]>(initial);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function setStatus(id: string, status: Inquiry['status']) {
    setUpdating(id);
    try {
      const res = await fetch(`/api/inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((i) => i.id === id ? { ...i, status } : i));
      }
    } finally {
      setUpdating(null);
    }
  }

  const counts = { new: 0, read: 0, replied: 0 };
  items.forEach((i) => { counts[i.status] = (counts[i.status] ?? 0) + 1; });

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', marginBottom: '1.5rem', borderBottom: `1px solid ${BORDER}`, paddingBottom: '1rem' }}>
        <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', color: GOLD, margin: 0 }}>
          Inquiries
        </h1>
        <span style={{ fontSize: '0.75rem', color: '#777' }}>
          {counts.new > 0 && <strong style={{ color: STATUS_COLORS.new }}>{counts.new} new</strong>}
          {counts.new > 0 && counts.replied > 0 && ' · '}
          {counts.replied > 0 && <span style={{ color: STATUS_COLORS.replied }}>{counts.replied} replied</span>}
          {items.length === 0 && 'No inquiries yet'}
        </span>
      </div>

      {items.length === 0 && (
        <p style={{ color: '#777', fontSize: '0.9rem' }}>No inquiries have been submitted yet.</p>
      )}

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {items.map((inq) => (
          <div
            key={inq.id}
            style={{
              border: `1px solid ${inq.status === 'new' ? 'rgba(185,28,28,0.4)' : BORDER}`,
              borderRadius: '3px',
              background: inq.status === 'new' ? 'rgba(185,28,28,0.03)' : 'white',
              overflow: 'hidden',
            }}
          >
            {/* Row summary */}
            <button
              onClick={() => setExpanded(expanded === inq.id ? null : inq.id)}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: '0.5rem 1rem',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: GOLD }}>
                  {inq.item_title}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#555', marginLeft: '0.5rem' }}>
                  — {inq.name}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#999', marginLeft: '0.5rem' }}>
                  {new Date(inq.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: STATUS_COLORS[inq.status] ?? '#555',
                  padding: '0.15rem 0.5rem',
                  border: `1px solid ${STATUS_COLORS[inq.status] ?? '#555'}`,
                  borderRadius: '2px',
                  whiteSpace: 'nowrap',
                }}
              >
                {inq.status}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#aaa' }}>
                {expanded === inq.id ? '▲' : '▼'}
              </span>
            </button>

            {/* Expanded detail */}
            {expanded === inq.id && (
              <div style={{ borderTop: `1px solid ${BORDER}`, padding: '1rem 1rem 0.75rem' }}>
                <PreferenceChips inquiry={inq} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '0.5rem 1.5rem', marginBottom: '0.75rem', fontSize: '0.8125rem' }}>
                  <div>
                    <span style={{ color: '#999', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Phone</span>
                    <div><a href={`tel:${inq.phone.replace(/\D/g, '')}`} style={{ color: GOLD }}>{inq.phone}</a></div>
                  </div>
                  {inq.email && (
                    <div>
                      <span style={{ color: '#999', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Email</span>
                      <div><a href={`mailto:${inq.email}`} style={{ color: GOLD }}>{inq.email}</a></div>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.8125rem', marginBottom: '0.75rem', whiteSpace: 'pre-wrap', color: '#333' }}>
                  {inq.message}
                </div>
                {/* Uploaded photos */}
                {imageList(inq.uploaded_image_urls).length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <span style={{ color: '#999', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Photos ({imageList(inq.uploaded_image_urls).length})
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
                      {imageList(inq.uploaded_image_urls).map((url, i) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'block', width: '5rem', height: '5rem', borderRadius: '4px', overflow: 'hidden', border: `1px solid ${BORDER}`, background: '#faf7f0' }}
                        >
                          <Image
                            src={url}
                            alt={`${inq.item_title} photo ${i + 1}`}
                            width={80}
                            height={80}
                            unoptimized
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {/* Status actions */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {inq.status !== 'read' && (
                    <button
                      onClick={() => setStatus(inq.id, 'read')}
                      disabled={updating === inq.id}
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', border: `1px solid ${GOLD}`, color: GOLD, background: 'none', cursor: 'pointer', borderRadius: '2px' }}
                    >
                      Mark read
                    </button>
                  )}
                  {inq.status !== 'replied' && (
                    <button
                      onClick={() => setStatus(inq.id, 'replied')}
                      disabled={updating === inq.id}
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', border: '1px solid #166534', color: '#166534', background: 'none', cursor: 'pointer', borderRadius: '2px' }}
                    >
                      Mark replied
                    </button>
                  )}
                  {inq.status !== 'new' && (
                    <button
                      onClick={() => setStatus(inq.id, 'new')}
                      disabled={updating === inq.id}
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', border: `1px solid rgba(185,28,28,0.5)`, color: '#b91c1c', background: 'none', cursor: 'pointer', borderRadius: '2px' }}
                    >
                      Reset to new
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
