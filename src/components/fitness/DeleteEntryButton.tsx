'use client';

import React, { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface DeleteEntryButtonProps {
  entryId: string;
  entryType: 'food' | 'exercise';
}

/**
 * Client-side delete button for food/exercise entries.
 * Server components can't handle onClick, so we render this small
 * interactive component inline within the entry cards.
 */
export function DeleteEntryButton({ entryId, entryType }: DeleteEntryButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      const endpoint = entryType === 'food' ? '/api/diary' : '/api/exercise';
      const res = await fetch(`${endpoint}?id=${entryId}`, { method: 'DELETE' });

      if (res.ok) {
        router.refresh(); // Triggers server re-render
      } else {
        console.error(`Failed to delete ${entryType} entry`);
        setIsDeleting(false);
      }
    } catch (err) {
      console.error('Delete error:', err);
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      aria-label={`Delete ${entryType} entry`}
      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-rose-500/15 text-slate-600 hover:text-rose-400 transition-all duration-200 disabled:opacity-50"
    >
      {isDeleting ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Trash2 size={14} />
      )}
    </button>
  );
}
