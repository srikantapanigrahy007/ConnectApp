import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../test/render';
import { MessageComposer } from './MessageComposer';

describe('MessageComposer', () => {
  it('sends trimmed text on Enter and keeps Shift+Enter for new lines', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);
    const input = await screen.findByLabelText('Message');

    await user.type(input, '  hello{Shift>}{Enter}{/Shift}there  ');
    expect(onSend).not.toHaveBeenCalled();

    await user.keyboard('{Enter}');
    expect(onSend).toHaveBeenCalledWith('hello\nthere');
    expect(input).toHaveValue('');
  });

  it('does not send blank messages', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderWithProviders(<MessageComposer onSend={onSend} />);

    await user.type(await screen.findByLabelText('Message'), '   {Enter}');

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('is fully disabled, with a reason, when sending is unavailable', async () => {
    renderWithProviders(<MessageComposer disabledReason="Messaging isn't available yet" />);

    const input = await screen.findByLabelText('Message');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', "Messaging isn't available yet");
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });
});
