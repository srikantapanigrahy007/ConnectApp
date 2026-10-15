import { createGroupSchema, LIMITS } from '#shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../../components/ui/Button';
import { Dialog } from '../../../components/ui/Dialog';
import { Field } from '../../../components/ui/Field';
import { Textarea } from '../../../components/ui/FormControls';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import * as groupsApi from '../api';
import { useGroupMutation } from '../hooks';
import { PeoplePicker } from './PeoplePicker';

const FORM_ID = 'create-group-form';

/** Creates a group (validated with the shared schema; the server checks everything again). */
export function CreateGroupDialog({ open, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [errors, setErrors] = useState({});
  const create = useGroupMutation((input) => groupsApi.createGroup(input));
  const navigate = useNavigate();
  const { toast } = useToast();

  const close = () => {
    setName('');
    setDescription('');
    setMemberIds([]);
    setErrors({});
    onClose();
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const parsed = createGroupSchema.safeParse({ name, description, memberIds });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message])),
      );
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: (group) => {
        toast({ tone: 'success', title: `Group “${group.name}” created` });
        close();
        void navigate(`/chats/${group.id}`);
      },
      onError: (error) =>
        setErrors({
          form: error instanceof ApiError ? error.message : 'Something went wrong. Try again.',
        }),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New group"
      description="Create a group and add people you're connected with. You can invite others with a link later."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={create.isPending}>
            Create group
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={onSubmit} className="space-y-4">
        {errors.form ? (
          <p role="alert" className="text-sm text-danger-700">
            {errors.form}
          </p>
        ) : null}
        <Field label="Group name" error={errors.name}>
          {(control) => (
            <Input
              {...control}
              data-autofocus
              maxLength={LIMITS.groupNameMaxLength}
              autoComplete="off"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Description" optional error={errors.description}>
          {(control) => (
            <Textarea
              {...control}
              maxLength={LIMITS.groupDescriptionMaxLength}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Add members</legend>
          <PeoplePicker selected={memberIds} onChange={setMemberIds} />
          {errors.memberIds ? (
            <p className="mt-1 text-sm text-danger-700">{errors.memberIds}</p>
          ) : null}
        </fieldset>
      </form>
    </Dialog>
  );
}
