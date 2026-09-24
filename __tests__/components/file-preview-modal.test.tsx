import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { FilePreviewModal } from '@/components/files/FilePreviewModal';

/**
 * P0-07 — the preview modal asks for a short-lived URL when it opens.
 *
 * Managed files used to carry a persisted 2-day signed `previewUrl` that the modal rendered
 * directly. Records no longer hold one, so the modal must request it from the ACL-checked
 * download route every time it opens, render whatever that route returns, and degrade to a
 * message — never a broken frame — when the route refuses.
 */

const SIGNED = 'https://storage.googleapis.com/b/o?X-Goog-Signature=abc';

function previewRoute(handler: () => Response) {
  const calls: string[] = [];
  server.use(
    http.get('http://localhost/api/files/:id/download', ({ request }) => {
      calls.push(request.url);
      return handler();
    }),
  );
  return calls;
}

describe('FilePreviewModal (P0-07)', () => {
  it('requests an inline, JSON-formatted URL for the file and renders it', async () => {
    const calls = previewRoute(() => HttpResponse.json({ ok: true, url: SIGNED }));
    const { container } = render(
      <FilePreviewModal
        open
        onClose={() => undefined}
        file={{ id: 'file_1', name: 'brief.pdf', mimeType: 'application/pdf' }}
      />,
    );

    await waitFor(() => expect(container.querySelector('iframe')).toHaveAttribute('src', SIGNED));
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/api/files/file_1/download');
    expect(url.searchParams.get('disposition')).toBe('inline');
    expect(url.searchParams.get('format')).toBe('json');
  });

  it('renders a video preview from the minted URL', async () => {
    previewRoute(() => HttpResponse.json({ ok: true, url: SIGNED }));
    const { container } = render(
      <FilePreviewModal
        open
        onClose={() => undefined}
        file={{ id: 'file_2', name: 'clip.mp4', mimeType: 'video/mp4' }}
      />,
    );
    await waitFor(() => expect(container.querySelector('video')).toHaveAttribute('src', SIGNED));
  });

  it('shows the refusal instead of a preview when the ACL denies it', async () => {
    previewRoute(() => HttpResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }));
    const { container } = render(
      <FilePreviewModal
        open
        onClose={() => undefined}
        file={{ id: 'file_3', name: 'brief.pdf', mimeType: 'application/pdf' }}
      />,
    );
    await screen.findByText('Forbidden');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('shows a generic message when the route is unreachable', async () => {
    previewRoute(() => HttpResponse.error());
    render(
      <FilePreviewModal
        open
        onClose={() => undefined}
        file={{ id: 'file_4', name: 'pic.png', mimeType: 'image/png' }}
      />,
    );
    await screen.findByText('Preview unavailable.');
  });

  it('asks for nothing when closed, or for a type it cannot preview', async () => {
    const calls = previewRoute(() => HttpResponse.json({ ok: true, url: SIGNED }));
    const { rerender, container } = render(
      <FilePreviewModal
        open={false}
        onClose={() => undefined}
        file={{ id: 'file_5', name: 'brief.pdf', mimeType: 'application/pdf' }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <FilePreviewModal
        open
        onClose={() => undefined}
        file={{ id: 'file_5', name: 'sheet.xlsx', mimeType: 'application/vnd.ms-excel' }}
      />,
    );
    expect(screen.getByText('sheet.xlsx')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toHaveLength(0);
  });
});
