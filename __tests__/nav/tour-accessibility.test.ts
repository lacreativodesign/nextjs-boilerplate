import '@testing-library/jest-dom';
import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlatformTour } from '@/components/onboarding/PlatformTour';

/**
 * O1 — the first-login PlatformTour is an accessible dialog (ONB-03).
 *
 * The tour renders as a role="dialog" aria-modal overlay, but previously did nothing to manage
 * focus: focus was never moved into it, Tab could escape it, Escape did nothing, and focus was
 * never restored on close. It also pulsed the highlight regardless of the user's reduced-motion
 * preference. This session adds a focus trap, initial focus, Escape-to-close, focus restoration
 * on unmount, and a reduced-motion guard on the pulse.
 *
 * These tests pin the accessibility contract and fail the build if any of it regresses.
 */
describe('O1: PlatformTour dialog accessibility (ONB-03)', () => {
  const renderTour = (onClose = jest.fn()) =>
    render(createElement(PlatformTour, { role: 'Owner', companyName: 'Acme', onClose }));

  it('remembers the previously focused element and restores focus on unmount', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open tour';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = renderTour();
    // Focus has been pulled into the tour, away from the trigger.
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    // On close, focus returns to the element that had it before the tour opened.
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });

  it('moves initial focus into the tour card', () => {
    renderTour();
    const skip = screen.getByRole('button', { name: 'Skip' });
    const active = document.activeElement as HTMLElement;
    expect(skip.closest('section')).toContainElement(active);
    expect(active.tagName).toBe('BUTTON');
  });

  it('closes on Escape and traps Tab within the card', () => {
    const onClose = jest.fn();
    renderTour(onClose);

    const skip = screen.getByRole('button', { name: 'Skip' });
    const next = screen.getByRole('button', { name: 'Next' });

    // Forward Tab from the last focusable element wraps back to the first.
    next.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(skip);

    // Shift+Tab from the first focusable element wraps to the last.
    skip.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(next);

    // Escape completes (closes) the tour.
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables the highlight pulse under prefers-reduced-motion', () => {
    const { container } = renderTour();
    const style = container.querySelector('style');
    expect(style).not.toBeNull();
    const css = style!.textContent ?? '';
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*\{\s*\.platform-tour-highlight\s*\{\s*animation:\s*none;/,
    );
  });
});
