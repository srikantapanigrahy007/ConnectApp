/** Accepts only same-site relative paths ("/chats"), never "//host" or absolute URLs. */
export function safeReturnPath(value, fallback = '/chats') {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return fallback;
  return value;
}
