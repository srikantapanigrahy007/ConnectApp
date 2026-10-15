/**
 * Validates a form's current values against a Zod schema. On failure, returns the first
 * message per field and moves focus to the first invalid control.
 */
export function validateForm(schema, form) {
  const values = {};
  new FormData(form).forEach((value, key) => {
    if (typeof value === 'string') values[key] = value;
  });

  const result = schema.safeParse(values);
  if (result.success) return { success: true, data: result.data, errors: {} };

  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.');
    errors[key] ??= issue.message;
  }

  const firstInvalid = result.error.issues[0]?.path.join('.');
  if (firstInvalid) {
    const control = form.elements.namedItem(firstInvalid);
    if (control instanceof HTMLElement) control.focus();
  }
  return { success: false, errors };
}

/** Removes a single field's error, e.g. when the user edits that field. */
export function clearFieldError(errors, field) {
  if (!(field in errors)) return errors;
  const { [field]: _removed, ...rest } = errors;
  return rest;
}

/** Field errors from an API validation/conflict response, keyed like the form fields. */
export function fieldErrorsFromApi(details) {
  const errors = {};
  for (const detail of details) errors[detail.path] ??= detail.message;
  return errors;
}
