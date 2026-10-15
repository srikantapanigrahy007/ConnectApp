import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/render';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { DropdownMenu } from './DropdownMenu';
import { Tabs } from './Tabs';
import { useToast } from './toast-context';

describe('DropdownMenu', () => {
  function renderMenu(onEdit = vi.fn()) {
    renderWithProviders(
      <DropdownMenu
        label="Options"
        trigger="Options"
        items={[
          { label: 'Edit', onSelect: onEdit },
          { label: 'Unavailable', disabled: true },
          { type: 'separator' },
          { label: 'Delete', onSelect: vi.fn() },
        ]}
      />,
    );
    return onEdit;
  }

  it('opens with the keyboard, skips disabled items and wraps around', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = await screen.findByRole('button', { name: 'Options' });

    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    renderMenu();
    const trigger = await screen.findByRole('button', { name: 'Options' });

    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('runs the selected action and ignores disabled items', async () => {
    const user = userEvent.setup();
    const onEdit = renderMenu();

    await user.click(await screen.findByRole('button', { name: 'Options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Unavailable' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('keeps a fixed menu next to its trigger and inside the viewport', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(360);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(640);
    // A trigger near the bottom-right corner, with a 240×200 menu.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rect() {
      return this.getAttribute('role') === 'menu'
        ? { top: 0, left: 0, right: 240, bottom: 200, width: 240, height: 200 }
        : { top: 600, left: 330, right: 362, bottom: 632, width: 32, height: 32 };
    });
    renderWithProviders(
      <DropdownMenu
        strategy="fixed"
        label="Options"
        trigger="Options"
        items={[{ label: 'Edit' }]}
      />,
    );

    await user.click(await screen.findByRole('button', { name: 'Options' }));
    const menu = screen.getByRole('menu');
    // No room below, so it opens above the trigger; its right edge is clamped 8px from the edge.
    expect(menu).toHaveStyle({ top: '396px', left: '112px' });

    // Scrolling the list underneath closes it instead of leaving it detached.
    document.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    vi.restoreAllMocks();
  });
});

describe('Dialog', () => {
  function DialogHarness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Rename"
          description="Pick a name"
        />
      </>
    );
  }

  it('is labelled by its title and closes from the close button, restoring focus', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DialogHarness />);
    const opener = await screen.findByRole('button', { name: 'Open' });

    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Rename' });
    expect(dialog).toHaveAccessibleDescription('Pick a name');

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('Tabs', () => {
  it('moves selection with arrow keys', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Tabs
        label="Requests"
        tabs={[
          { id: 'a', label: 'Received', content: 'Received panel' },
          { id: 'b', label: 'Sent', content: 'Sent panel' },
        ]}
      />,
    );

    await user.click(await screen.findByRole('tab', { name: 'Received' }));
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Sent' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Sent' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Sent panel');
  });
});

describe('Toasts', () => {
  function ToastTrigger() {
    const { toast } = useToast();
    return (
      <Button onClick={() => toast({ tone: 'danger', title: 'Upload failed' })}>Trigger</Button>
    );
  }

  it('announces danger toasts as alerts and can be dismissed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ToastTrigger />);

    await user.click(await screen.findByRole('button', { name: 'Trigger' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});

describe('Avatar', () => {
  it('shows initials and an accessible name', async () => {
    renderWithProviders(<Avatar name="Ada Lovelace" presence="online" />);

    const avatar = await screen.findByRole('img', { name: 'Ada Lovelace' });
    expect(avatar).toHaveTextContent('AL');
    expect(avatar).toHaveTextContent('Online');
  });
});
