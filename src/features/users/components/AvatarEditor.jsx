import { AVATAR_MIME_TYPES, LIMITS } from '#shared';
import { ImageUp, Trash } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/toast-context';
import { ApiError } from '../../../lib/api-client';
import { useRemoveAvatar, useUploadAvatar } from '../hooks';

const MAX_MB = LIMITS.avatarMaxBytes / (1024 * 1024);

/**
 * Profile picture upload. The quick checks here only save a wasted upload: the server checks the
 * type, size and real file contents again and re-encodes the image.
 */
export function AvatarEditor({ profile }) {
  const inputRef = useRef(null);
  const hintId = useId();
  const [error, setError] = useState(null);
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const { toast } = useToast();
  const busy = upload.isPending || remove.isPending;

  const onFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!AVATAR_MIME_TYPES.includes(file.type)) {
      setError('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > LIMITS.avatarMaxBytes) {
      setError(`Images must be ${MAX_MB} MB or smaller.`);
      return;
    }
    setError(null);
    upload.mutate(file, {
      onSuccess: () => toast({ tone: 'success', title: 'Profile picture updated' }),
      onError: (failure) =>
        setError(failure instanceof ApiError ? failure.message : 'The upload failed.'),
    });
  };

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <Avatar
        name={profile.displayName}
        src={profile.avatarUrl ?? undefined}
        size="xl"
        decorative
      />
      <div className="flex flex-col items-center gap-2 sm:items-start">
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_MIME_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFile}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={ImageUp}
            loading={upload.isPending}
            disabled={busy}
            aria-describedby={hintId}
            onClick={() => inputRef.current?.click()}
          >
            {profile.avatarUrl ? 'Change photo' : 'Upload photo'}
          </Button>
          {profile.avatarUrl ? (
            <Button
              variant="ghost"
              size="sm"
              icon={Trash}
              loading={remove.isPending}
              disabled={busy}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => toast({ title: 'Profile picture removed' }),
                })
              }
            >
              Remove
            </Button>
          ) : null}
        </div>
        <p id={hintId} className="text-xs text-ink-muted">
          JPEG, PNG or WebP, up to {MAX_MB} MB. It's cropped to a square and location data is
          removed.
        </p>
        {error ? (
          <Alert tone="danger" role="alert" className="w-full">
            {error}
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
