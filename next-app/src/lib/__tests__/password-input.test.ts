import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PasswordInput from '@/components/account/PasswordInput';

const APP_ROOT = path.resolve(process.cwd());
const SOURCE_ROOT = path.join(APP_ROOT, 'src');
const SHARED_COMPONENT = path.join('src', 'components', 'account', 'PasswordInput.tsx');

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.tsx?$/.test(entry.name) ? [fullPath] : [];
  });
}

describe('PasswordInput', () => {
  it('starts masked, with the toggle advertising its state rather than asserting visibility', () => {
    const html = renderToStaticMarkup(createElement(PasswordInput, { id: 'password' }));

    expect(html).toContain('type="password"');
    // aria-pressed carries state; the label must say "Show" while still masked.
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Show password"');
    // The toggle must point at the input it controls.
    expect(html).toContain('aria-controls="password"');
    expect(html).toContain('class="password-field"');
  });

  it('labels the confirm field distinctly — two identical "Show password" buttons are ambiguous', () => {
    const primary = renderToStaticMarkup(createElement(PasswordInput, { id: 'a' }));
    const confirm = renderToStaticMarkup(createElement(PasswordInput, { id: 'b', confirm: true }));

    expect(primary).toContain('aria-label="Show password"');
    expect(confirm).toContain('aria-label="Show confirm password"');
  });

  it('localizes the toggle label', () => {
    expect(renderToStaticMarkup(createElement(PasswordInput, { id: 'a', isEs: true })))
      .toContain('aria-label="Mostrar contraseña"');
    expect(renderToStaticMarkup(createElement(PasswordInput, { id: 'b', isEs: true, confirm: true })))
      .toContain('aria-label="Mostrar confirmación"');
  });

  it('always generates an id so aria-controls is never dangling', () => {
    const html = renderToStaticMarkup(createElement(PasswordInput, {}));
    const controls = html.match(/aria-controls="([^"]+)"/)?.[1];
    const inputId = html.match(/<input[^>]*\bid="([^"]+)"/)?.[1];

    expect(controls).toBeTruthy();
    expect(inputId).toBe(controls);
  });

  it('forwards caller props (autoComplete, required, placeholder) to the real input', () => {
    const html = renderToStaticMarkup(createElement(PasswordInput, {
      id: 'password',
      autoComplete: 'new-password',
      required: true,
      placeholder: 'Min. 6 characters',
    }));

    // Attribute names are case-insensitive in HTML and React preserves the
    // camelCase spelling here, so match without regard to case.
    expect(html.toLowerCase()).toContain('autocomplete="new-password"');
    expect(html).toContain('required');
    expect(html).toContain('placeholder="Min. 6 characters"');
  });

  it('is the ONLY source of password inputs — no page may hand-roll one again', () => {
    // Every account password field routes through this component, so the site
    // can never drift back to the three different treatments it had before
    // (eye toggle / text Show-Hide button / no toggle at all).
    const offenders = sourceFiles(SOURCE_ROOT).filter((file) => {
      const relative = path.relative(APP_ROOT, file);
      // The component itself, and the tests that assert on its markup.
      if (relative === SHARED_COMPONENT || relative.includes('__tests__')) return false;
      const contents = fs.readFileSync(file, 'utf8');
      return /type=(?:"password"|'password'|\{\s*['"]password['"]\s*\})/.test(contents);
    }).map((file) => path.relative(APP_ROOT, file));

    // Admin credential fields (Instagram/Facebook token pasting) are secrets,
    // not user passwords, and intentionally have no reveal control.
    const allowed = [
      path.join('src', 'components', 'admin', 'InstagramSettingsPanel.tsx'),
      path.join('src', 'components', 'admin', 'FacebookSettingsPanel.tsx'),
    ];

    expect(offenders.filter((file) => !allowed.includes(file))).toEqual([]);
  });
});
