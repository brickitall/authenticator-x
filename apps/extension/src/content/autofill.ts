/**
 * Injected on demand into the active tab to find and fill a one-time-code
 * field. Runs only after the user opens the popup on that tab (activeTab), and
 * reads nothing except the shape of the form.
 */
import type { ContentRequest, FieldDetection } from '../lib/messaging.js';

declare global {
  interface Window {
    __authxAutofillReady?: boolean;
  }
}

const NAME_PATTERN =
  /(^|[^a-z])(otp|totp|2fa|mfa|tfa|token|passcode|pin)([^a-z]|$)|one[-_\s]?time|verification[-_\s]?code|security[-_\s]?code|auth(entication)?[-_\s]?code|confirm(ation)?[-_\s]?code|mã[-_\s]?(otp|xác[-_\s]?thực)/i;

const NEGATIVE_PATTERN = /(zip|postal|phone|card|cvv|cvc|expiry|amount|quantity|search)/i;

function attributeHaystack(input: HTMLInputElement): string {
  const label = input.labels?.[0]?.textContent ?? '';
  return [
    input.name,
    input.id,
    input.placeholder,
    input.getAttribute('aria-label') ?? '',
    input.getAttribute('data-testid') ?? '',
    input.className,
    label,
  ].join(' ');
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden) return false;
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isCandidate(input: HTMLInputElement): boolean {
  if (input.disabled || input.readOnly || !isVisible(input)) return false;

  const type = (input.type || 'text').toLowerCase();
  if (!['text', 'tel', 'number', 'password'].includes(type)) return false;

  // The unambiguous signal, when a site bothers to set it.
  if (input.autocomplete === 'one-time-code') return true;

  const haystack = attributeHaystack(input);
  if (NEGATIVE_PATTERN.test(haystack)) return false;
  if (NAME_PATTERN.test(haystack)) return true;

  // Split-digit layouts rarely name their inputs; a row of maxlength=1 boxes
  // in an otherwise short form is the giveaway.
  const maxLength = input.maxLength;
  return maxLength === 1 && input.inputMode !== 'text';
}

function findFields(): HTMLInputElement[] {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input'));
  const candidates = inputs.filter(isCandidate);

  // Prefer a contiguous run of single-character boxes if one exists.
  const singles = candidates.filter((input) => input.maxLength === 1);
  if (singles.length >= 4) return singles;

  return candidates.slice(0, 1);
}

/**
 * Assigning `input.value` directly is invisible to React, which tracks the
 * previous value on the DOM node. Going through the prototype setter and then
 * dispatching the events makes controlled components pick the change up.
 */
function setValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) {
    setter.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function fill(code: string): FieldDetection {
  const fields = findFields();
  if (fields.length === 0) return { found: false, count: 0 };

  if (fields.length === 1) {
    const field = fields[0]!;
    field.focus();
    setValue(field, code);
    return { found: true, count: 1 };
  }

  // Split-digit form: one character per box, focusing each so any per-box
  // keystroke handlers run in the order the site expects.
  const digits = code.split('');
  fields.slice(0, digits.length).forEach((field, index) => {
    field.focus();
    setValue(field, digits[index]!);
  });
  fields[Math.min(digits.length, fields.length) - 1]?.focus();

  return { found: true, count: fields.length };
}

function detect(): FieldDetection {
  const fields = findFields();
  return { found: fields.length > 0, count: fields.length };
}

// executeScript may run this file more than once on the same page; only the
// first run registers a listener so responses are not duplicated.
if (!window.__authxAutofillReady) {
  window.__authxAutofillReady = true;

  chrome.runtime.onMessage.addListener(
    (message: ContentRequest, sender, sendResponse: (response: FieldDetection) => void) => {
      if (sender.id !== chrome.runtime.id) return false;

      if (message.type === 'authx/detect') {
        sendResponse(detect());
        return false;
      }
      if (message.type === 'authx/fill') {
        sendResponse(fill(message.code));
        return false;
      }
      return false;
    },
  );
}
