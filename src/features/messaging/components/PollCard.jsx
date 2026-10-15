import { BarChart3, Lock } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';

/**
 * A group poll. Results are shown live as counts only (votes are anonymous). While it's open you
 * may vote, change your vote or withdraw it; the creator and admins may close it. The server
 * applies every rule; this card only shows what it confirmed.
 */
export function PollCard({ poll, onVote, onClose, canClose }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(null);
  const groupId = useId();
  const myVotes = poll.myVotes ?? [];
  const choice = selected ?? myVotes;
  const changed =
    choice.length !== myVotes.length || choice.some((option) => !myVotes.includes(option));
  const total = poll.totalVoters;

  const toggle = (optionId) => {
    if (!poll.multiple) setSelected([optionId]);
    else {
      setSelected(
        choice.includes(optionId) ? choice.filter((id) => id !== optionId) : [...choice, optionId],
      );
    }
  };

  const run = async (kind, task) => {
    setBusy(kind);
    try {
      await task();
      setSelected(null);
    } catch {
      // The conversation screen shows the server's reason.
    } finally {
      setBusy(null);
    }
  };

  return (
    <fieldset className="w-72 max-w-full rounded-xl border border-border bg-surface p-3 text-left text-sm text-ink">
      <legend className="sr-only">Poll: {poll.question}</legend>
      <p className="flex items-start gap-1.5 font-semibold">
        <BarChart3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-700" />
        <span className="break-words">{poll.question}</span>
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {poll.closed ? (
          <span className="inline-flex items-center gap-1">
            <Lock aria-hidden="true" className="size-3" /> Closed · final results
          </span>
        ) : poll.multiple ? (
          'Choose one or more · anonymous'
        ) : (
          'Choose one · anonymous'
        )}
      </p>
      <ul className="mt-2 space-y-1.5">
        {poll.options.map((option) => {
          const percent = total ? Math.round((option.votes / total) * 100) : 0;
          const inputId = `${groupId}-${option.id}`;
          return (
            <li
              key={option.id}
              className="relative overflow-hidden rounded-lg border border-border"
            >
              <div
                aria-hidden="true"
                className="absolute inset-y-0 left-0 bg-primary-100"
                style={{ width: `${percent}%` }}
              />
              <label
                htmlFor={inputId}
                className={cn(
                  'relative flex items-center gap-2 px-2.5 py-1.5',
                  poll.closed ? 'cursor-default' : 'cursor-pointer',
                )}
              >
                <input
                  id={inputId}
                  type={poll.multiple ? 'checkbox' : 'radio'}
                  name={groupId}
                  checked={choice.includes(option.id)}
                  disabled={poll.closed || Boolean(busy)}
                  onChange={() => toggle(option.id)}
                  className="accent-primary-600"
                />
                <span className="min-w-0 flex-1 break-words">{option.text}</span>
                <span className="text-xs text-ink-muted">
                  {option.votes} · {percent}%
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">
        {total === 1 ? '1 person voted' : `${total} people voted`}
      </p>
      {!poll.closed ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!changed || choice.length === 0}
            loading={busy === 'vote'}
            onClick={() => void run('vote', () => onVote(choice))}
          >
            {myVotes.length ? 'Change vote' : 'Vote'}
          </Button>
          {myVotes.length ? (
            <Button
              size="sm"
              variant="secondary"
              loading={busy === 'retract'}
              onClick={() => void run('retract', () => onVote([]))}
            >
              Withdraw vote
            </Button>
          ) : null}
          {canClose ? (
            <Button
              size="sm"
              variant="ghost"
              loading={busy === 'close'}
              onClick={() => void run('close', onClose)}
            >
              Close poll
            </Button>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
