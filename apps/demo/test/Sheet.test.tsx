import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from '../src/components/Sheet';

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [ticks, setTicks] = useState(0);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open extras</button>
      <button type="button" onClick={() => setTicks((n) => n + 1)}>Re-render {ticks}</button>
      <Sheet open={open} label="Extras" onClose={() => { onClose(); setOpen(false); }}>
        <input aria-label="Note" />
      </Sheet>
    </div>
  );
}

describe('Sheet', () => {
  it('renders nothing until it is opened', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a modal dialog with its label and takes the focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open extras' }));
    const dialog = screen.getByRole('dialog', { name: 'Extras' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('closes on Escape, gives the focus back to the opener, and unlocks the page', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Open extras' });
    await user.click(opener);
    await user.type(screen.getByLabelText('Note'), 'no onions');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on a backdrop click and on the close button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open extras' }));
    await user.click(screen.getByTestId('sheet-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open extras' }));
    await user.click(screen.getByRole('button', { name: 'Close Extras' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the focus where the user put it when the parent re-renders', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open extras' }));
    const note = screen.getByLabelText('Note');
    await user.click(note);
    // The parent re-renders and hands Sheet a new onClose function; the sheet must not steal the focus back.
    screen.getByRole('button', { name: /Re-render/ }).click();
    expect(await screen.findByRole('button', { name: 'Re-render 1' })).toBeInTheDocument();
    expect(note).toHaveFocus();
  });

  function TwoSheets() {
    const [first, setFirst] = useState(false);
    const [second, setSecond] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => setFirst(true)}>Open first</button>
        <Sheet open={first} label="First" onClose={() => setFirst(false)}>
          <button type="button" onClick={() => setSecond(true)}>Open second</button>
        </Sheet>
        <Sheet open={second} label="Second" onClose={() => setSecond(false)}>
          <button type="button" onClick={() => setFirst(false)}>Close the first</button>
        </Sheet>
      </div>
    );
  }

  it('keeps Tab and Shift+Tab inside the sheet', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open extras' }));
    const dialog = screen.getByRole('dialog', { name: 'Extras' });
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByLabelText('Note')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close Extras' })).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Note')).toHaveFocus();
  });

  it('closes only the top sheet on Escape', async () => {
    const user = userEvent.setup();
    render(<TwoSheets />);
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    await user.click(screen.getByRole('button', { name: 'Open second' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'First' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Second' })).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('unlocks the page whichever sheet closes first', async () => {
    const user = userEvent.setup();
    render(<TwoSheets />);
    await user.click(screen.getByRole('button', { name: 'Open first' }));
    await user.click(screen.getByRole('button', { name: 'Open second' }));
    await user.click(screen.getByRole('button', { name: 'Close the first' }));
    expect(screen.queryByRole('dialog', { name: 'First' })).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});
