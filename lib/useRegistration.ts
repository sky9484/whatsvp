'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './auth';
import type { Event, RegistrationQuestion, RegistrationAttendee, RegistrationAnswerValue, RsvpStatus } from './types';

interface RegistrationData {
  questions: RegistrationQuestion[];
  capacity: number | null;
  approvalMode: boolean;
  confirmedCount: number;
  attendees: RegistrationAttendee[];
  myStatus: RsvpStatus;
  guild: { name: string; logo_url: string | null; color: string | null } | null;
}

type SubmitResult = { status: 'confirmed' | 'pending'; mailSent?: boolean; claimUrl?: string };

/**
 * Data + submit logic for RegisterModal (v4 P2) — kept separate from the JSX
 * per this codebase's established hook/component split (see useEventDetail.ts
 * / EventDetailContent.tsx). Talks only to /api/register — event_rsvps'
 * direct client INSERT was revoked once capacity/approval became real
 * server-enforced invariants (see 009_registration.sql).
 */
export function useRegistration(event: Event) {
  const { address, token, login } = useAuth();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RegistrationData>({
    questions: [],
    capacity: null,
    approvalMode: false,
    confirmedCount: 0,
    attendees: [],
    myStatus: 'none',
    guild: null,
  });
  const [answers, setAnswers] = useState<Record<string, RegistrationAnswerValue>>({});
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SubmitResult | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/register?event_id=${event.id}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then((r) => r.json())
      .then((d) => {
        setData({
          questions: d.questions ?? [],
          capacity: d.capacity ?? null,
          approvalMode: Boolean(d.approval_mode),
          confirmedCount: d.confirmed_count ?? 0,
          attendees: d.attendees ?? [],
          myStatus: d.my_status ?? 'none',
          guild: d.guild ?? null,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [event.id, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const setAnswer = useCallback((questionId: string, value: RegistrationAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const submit = async () => {
    setError('');
    if (!address && !guestEmail.trim()) {
      setError('Enter your email to register.');
      return;
    }
    setSubmitting(true);
    try {
      const payloadAnswers = Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer }));
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const body: Record<string, unknown> = { event_id: event.id, answers: payloadAnswers };
      if (address && token) {
        headers.Authorization = `Bearer ${token}`;
      } else {
        body.guest_name = guestName.trim();
        body.guest_email = guestEmail.trim();
      }
      const res = await fetch('/api/register', { method: 'POST', headers, body: JSON.stringify(body) });
      const resData = await res.json();
      if (!res.ok) {
        setError(resData.error ?? 'Could not register — try again.');
        return;
      }
      setResult({ status: resData.status, mailSent: resData.mail_sent, claimUrl: resData.claim_url });
      setData((prev) => ({
        ...prev,
        myStatus: resData.status,
        confirmedCount: resData.status === 'confirmed' ? prev.confirmedCount + 1 : prev.confirmedCount,
      }));
    } catch {
      setError('Network error — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    loading,
    ...data,
    answers,
    setAnswer,
    guestName,
    setGuestName,
    guestEmail,
    setGuestEmail,
    submitting,
    error,
    result,
    submit,
    isLoggedIn: Boolean(address),
    login,
  };
}
