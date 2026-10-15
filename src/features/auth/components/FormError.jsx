import { Alert } from '../../../components/ui/Alert';

/** Form-level error from the API, announced to screen readers. */
export function FormError({ error, title }) {
  if (!error) return null;
  const message =
    error.code === 'RATE_LIMITED'
      ? 'Too many attempts. Please wait a few minutes and try again.'
      : error.message;
  return (
    <Alert tone="danger" role="alert" title={title}>
      {message}
    </Alert>
  );
}
