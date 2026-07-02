'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { createAuthedClient } from '@/lib/supabase/client';

interface AddFriendButtonProps {
  profileId: string;
}

/** Small "+ friend" affordance — used in the Guilds roster and event attendee lists (v3 P4). */
export default function AddFriendButton({ profileId }: AddFriendButtonProps) {
  const { token, profile } = useAuth();
  const [state, setState] = useState<'idle' | 'sent' | 'error'>('idle');

  if (!profile || profile.id === profileId) return null;

  const send = async () => {
    const supabase = createAuthedClient(token);
    if (!supabase) return;
    const { error } = await supabase.from('friendships').insert({ requester_id: profile.id, addressee_id: profileId });
    if (error && error.code !== '23505') {
      setState('error');
      return;
    }
    setState('sent');
  };

  if (state === 'sent') return <span className="text-[10px] text-teal flex-none">Requested</span>;

  return (
    <button onClick={send} className="text-[10px] text-teal hover:text-teal/70 font-medium flex-none" title="Add friend">
      {state === 'error' ? 'Retry' : '+ friend'}
    </button>
  );
}
