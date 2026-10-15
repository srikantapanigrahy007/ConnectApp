import { createMessageRequestSchema, LIMITS } from '#shared';
import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Field } from '../../../components/ui/Field';
import { Textarea } from '../../../components/ui/FormControls';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { FormError } from '../../auth/components/FormError';
import { useSendRequest } from '../hooks';

export function SendRequestDialog({ open, onClose, user }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const send = useSendRequest();
  const { toast } = useToast();

  const close = () => {
    setNote('');
    setError(null);
    send.reset();
    onClose();
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const result = createMessageRequestSchema.safeParse({
      username: user.username,
      ...(note.trim() ? { note } : {}),
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Check your message');
      return;
    }
    send.mutate(result.data, {
      onSuccess: () => {
        toast({ tone: 'success', title: `Request sent to @${user.username}` });
        close();
      },
    });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Message request to @${user.username}`}
      description="They'll see your request and can accept or reject it. You can chat once they accept."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="send-request-form" loading={send.isPending}>
            Send request
          </Button>
        </>
      }
    >
      <form id="send-request-form" noValidate onSubmit={onSubmit} className="space-y-4">
        <FormError error={send.error instanceof ApiError ? send.error : null} />
        <Field
          label="Message"
          optional
          error={error ?? undefined}
          hint={`${note.length}/${LIMITS.messageRequestNoteMaxLength} characters`}
        >
          {(control) => (
            <Textarea
              {...control}
              data-autofocus
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setError(null);
              }}
              maxLength={LIMITS.messageRequestNoteMaxLength}
              rows={3}
              placeholder="Say hello and why you'd like to connect"
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
