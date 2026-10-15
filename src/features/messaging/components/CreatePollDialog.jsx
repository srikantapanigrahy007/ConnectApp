import { LIMITS, pollInputSchema } from '#shared';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Checkbox } from '../../../components/ui/FormControls';
import { Input } from '../../../components/ui/Input';

/** Creates a poll (validated with the same shared schema as the API). */
export function CreatePollDialog({ open, onClose, onCreate }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => {
    setQuestion('');
    setOptions(['', '']);
    setMultiple(false);
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };

  const submit = (event) => {
    event.preventDefault();
    const parsed = pollInputSchema.safeParse({
      question,
      options: options.map((option) => option.trim()).filter(Boolean),
      multiple,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the poll');
      return;
    }
    onCreate(parsed.data);
    close();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New poll"
      description="Votes are anonymous: everyone sees the counts, nobody sees who chose what."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="create-poll-form">
            Send poll
          </Button>
        </>
      }
    >
      <form id="create-poll-form" noValidate onSubmit={submit} className="space-y-3">
        {error ? (
          <p role="alert" className="text-sm text-danger-700">
            {error}
          </p>
        ) : null}
        <label className="block text-sm font-medium text-ink">
          Question
          <Input
            className="mt-1"
            data-autofocus
            value={question}
            maxLength={LIMITS.pollQuestionMaxLength}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">Options</legend>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                aria-label={`Option ${index + 1}`}
                value={option}
                maxLength={LIMITS.pollOptionTextMaxLength}
                onChange={(event) =>
                  setOptions(options.map((value, i) => (i === index ? event.target.value : value)))
                }
              />
              {options.length > LIMITS.pollMinOptions ? (
                <IconButton
                  label={`Remove option ${index + 1}`}
                  icon={X}
                  size="sm"
                  onClick={() => setOptions(options.filter((_, i) => i !== index))}
                />
              ) : null}
            </div>
          ))}
          {options.length < LIMITS.pollMaxOptions ? (
            <Button
              size="sm"
              variant="secondary"
              icon={Plus}
              onClick={() => setOptions([...options, ''])}
            >
              Add option
            </Button>
          ) : null}
        </fieldset>
        <Checkbox
          label="Allow several choices"
          checked={multiple}
          onChange={(event) => setMultiple(event.target.checked)}
        />
      </form>
    </Dialog>
  );
}
