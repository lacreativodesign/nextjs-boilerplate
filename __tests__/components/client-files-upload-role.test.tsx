import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import * as fs from 'fs';
import * as path from 'path';
import { server } from '../mocks/server';
import { clearTenantContextCache } from '@/lib/tenant/useTenantContext';
import ClientFilesPage from '@/app/client/files/page';

// `firebase/storage` (and lib/firebaseClient, which re-exports it) ship ESM only and are
// not in jest.config.js's transform allowlist, so importing the page pulls in a module
// Jest cannot parse. Neither is reached here: the page touches Storage only inside
// handleUpload, which no test invokes. Stubbing the two modules the page imports keeps
// the fix contained to this suite instead of widening the global transform for all 221.
jest.mock('firebase/storage', () => ({
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
}));
jest.mock('@/lib/firebaseClient', () => ({
  getFirebaseStorage: jest.fn(),
}));

/**
 * STOR-2 — /client/files offers an upload only to the role Storage will accept it from.
 *
 * canClientFiles() in storage.rules grants tenants/{tenantId}/client-files/** to role
 * 'client' ONLY. It is the one prefix helper that deliberately omits isSuperAdmin(),
 * because the prefix holds files uploaded BY the tenant's external clients. RequireAuth
 * lets super_admin past every route guard, so a super_admin reaches this page — and
 * before this change was shown an "Upload Client File" button whose uploadBytes() call
 * the published rules reject at runtime. The upload path is hidden for that role; the
 * file LIST is not, because read access is exactly what super_admin has here.
 */

const FILE_ROW = {
  id: 'f1',
  projectId: 'p1',
  projectName: 'Rebrand',
  category: 'Brief',
  fileName: 'creative-brief.pdf',
  downloadUrl: 'https://example.test/creative-brief.pdf',
  uploadedAt: '2026-01-15T10:00:00.000Z',
  size: 2048,
};

/** Serves the three endpoints the page loads, with the caller's role on the context. */
function mockRole(role: string) {
  server.use(
    http.get('http://localhost/api/tenant/context', () =>
      HttpResponse.json({
        ok: true,
        user: {
          uid: 'u1',
          role,
          tenantId: 't1',
          status: 'active',
          displayName: 'Test User',
          email: 'user@example.test',
        },
        tenant: null,
      }),
    ),
    http.get('http://localhost/api/client/files/list', () =>
      HttpResponse.json({ ok: true, files: [FILE_ROW] }),
    ),
    http.get('http://localhost/api/client/projects/list', () =>
      HttpResponse.json({ ok: true, projects: [{ id: 'p1', projectName: 'Rebrand' }] }),
    ),
  );
}

/** The upload trigger, and the drawer controls it opens. */
const queryUploadTrigger = () => screen.queryByRole('button', { name: 'Upload Client File' });

describe('STOR-2: the client files upload control follows the published Storage rules', () => {
  beforeEach(() => {
    // The hook caches the context at module scope for 5 minutes, so without this the
    // second role in this file would read the first role's response.
    clearTenantContextCache();
  });

  it('hides the upload control from super_admin, who Storage would reject', async () => {
    mockRole('super_admin');
    render(<ClientFilesPage />);

    await waitFor(() => expect(screen.getByText('creative-brief.pdf')).toBeInTheDocument());
    await waitFor(() => expect(queryUploadTrigger()).not.toBeInTheDocument());

    // The drawer holds the file input and its submit button; neither may mount.
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('tells super_admin why, in place of the control', async () => {
    mockRole('super_admin');
    render(<ClientFilesPage />);

    await waitFor(() =>
      expect(
        screen.getByText(
          'Client file uploads are performed by the client. Super Admin has read access only.',
        ),
      ).toBeInTheDocument(),
    );
  });

  it('still shows the upload control to role client, whom the rules grant', async () => {
    mockRole('client');
    render(<ClientFilesPage />);

    await waitFor(() => expect(screen.getByText('creative-brief.pdf')).toBeInTheDocument());
    expect(queryUploadTrigger()).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Client file uploads are performed by the client. Super Admin has read access only.',
      ),
    ).not.toBeInTheDocument();
  });

  it('lets client open the upload drawer, so the path stays live end to end', async () => {
    // The test above asserts the BUTTON renders. This one clicks it, which is the part
    // that actually proves role 'client' still reaches the upload path: the drawer that
    // mounts here carries the file input and the handleUpload trigger, and it is gated a
    // SECOND time on `!isSuperAdmin`. Asserting the control exists would still pass if
    // that second gate were inverted; opening it would not.
    mockRole('client');
    render(<ClientFilesPage />);
    await waitFor(() => expect(queryUploadTrigger()).toBeInTheDocument());

    fireEvent.click(queryUploadTrigger() as HTMLElement);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument());
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it.each(['super_admin', 'client'])('renders the file list for %s', async (role) => {
    mockRole(role);
    const { container } = render(<ClientFilesPage />);

    await waitFor(() => expect(screen.getByText('creative-brief.pdf')).toBeInTheDocument());
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    // The row, not just the shell: the whole point is that read access is unaffected.
    expect(within(table as HTMLElement).getByText('Rebrand')).toBeInTheDocument();
    expect(within(table as HTMLElement).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      FILE_ROW.downloadUrl,
    );
  });
});

describe('STOR-2: the page reads the role from the context the route already loads', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'app/client/files/page.tsx'), 'utf8');

  it('uses the shared tenant context and the shared role normaliser', () => {
    // Not a second auth path: AppShell loads this same context on this route and the
    // hook caches it at module scope, so the page adds no request of its own.
    expect(page).toContain("import { useTenantContext } from '@/lib/tenant/useTenantContext'");
    expect(page).toContain("import { normalizeRole } from '@/lib/erpAccess'");
    expect(page).toContain("normalizeRole(tenantContext?.user?.role) === 'super_admin'");
  });

  it('points at canClientFiles in storage.rules as the reason', () => {
    expect(page).toContain('STOR-2');
    expect(page).toContain('canClientFiles');
    expect(page).toContain('storage.rules');
  });

  it('keeps the reason true: canClientFiles grants client only, with no super_admin escape', () => {
    // If the rules ever grant super_admin this prefix, hiding the control becomes wrong.
    const rules = fs
      .readFileSync(path.join(process.cwd(), 'storage.rules'), 'utf8')
      .replace(/\/\/.*/g, '');
    const start = rules.indexOf('function canClientFiles(');
    expect(start).toBeGreaterThan(-1);
    const body = rules.slice(start, rules.indexOf('}', start) + 1);
    expect(body).toContain("tenantRole(tenantId, ['client'])");
    expect(body).not.toContain('isSuperAdmin');
  });

  it('gates only the upload path, never the list or the upload handler', () => {
    // Hiding the control must not become "delete the feature": the handler that other
    // roles use, and the tenant-scoped path helper S4 pins, both stay.
    expect(page).toContain('const handleUpload = async ()');
    expect(page).toContain('tenantClientFilePath({');
    expect(page).toContain('{uploadOpen && !isSuperAdmin && (');
    expect(page).toContain('<EmptyState');
  });

  it('paints the notice from a design token, not a hardcoded colour', () => {
    const notice = page.slice(page.indexOf('{isSuperAdmin ? ('), page.indexOf('Refresh'));
    expect(notice).toContain('text-[var(--text-muted)]');
    expect(notice).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
