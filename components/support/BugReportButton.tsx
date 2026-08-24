'use client';
import { useMemo, useRef, useState } from 'react';
import { Bug, X, CheckCircle, Camera, Loader2, Lightbulb, ExternalLink } from 'lucide-react';
import * as Sentry from '@sentry/nextjs';
import { apiFetch } from '@/lib/api/client';
import { searchArticles } from '@/lib/help-center/data';

/**
 * Screenshots are stored inline on the ticket document, which Firestore caps at
 * 1 MiB. Full-resolution PNG captures blow through that limit and the write
 * fails, so every image is downscaled and re-encoded as JPEG before upload.
 */
const MAX_SCREENSHOT_DIMENSION = 1280;
const SCREENSHOT_JPEG_QUALITY = 0.7;

function compressToDataUrl(source: CanvasImageSource, width: number, height: number): string {
  const scale = Math.min(1, MAX_SCREENSHOT_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', SCREENSHOT_JPEG_QUALITY);
}

export default function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string>('');
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Deflection: match the typed description against the help center in-memory.
  // This runs entirely client-side (zero API cost) and only once the user has
  // written enough to match on. Showing a relevant article BEFORE a ticket is
  // filed is the cheapest possible support: it deflects the question without any
  // human or AI touching it.
  const suggestions = useMemo(() => {
    const q = description.trim();
    if (q.length < 12 || suggestionsDismissed) return [];
    return searchArticles(q).slice(0, 3);
  }, [description, suggestionsDismissed]);

  const reset = () => {
    setName('');
    setEmail('');
    setDescription('');
    setScreenshot(null);
    setScreenshotName('');
    setError('');
    setSubmitted(false);
    setSuggestionsDismissed(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const captureScreen = async () => {
    setCapturing(true);
    setError('');
    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { mediaSource: 'screen' },
      });
      const track = stream.getVideoTracks()[0];
      const imageCapture = new (window as any).ImageCapture(track);
      const bitmap = (await imageCapture.grabFrame()) as ImageBitmap;
      track.stop();
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());

      const dataUrl = compressToDataUrl(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      setScreenshot(dataUrl);
      setScreenshotName('screenshot.jpg');
    } catch {
      // User cancelled or browser doesn't support — fall back silently
      setError('');
    } finally {
      setCapturing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('Image must be under 15MB.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const dataUrl = compressToDataUrl(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      setScreenshot(dataUrl);
      setScreenshotName(file.name);
      setError('');
    } catch {
      setError('Could not read that image. Please try another file.');
    }
  };

  // The user clicked "This solved it" on a suggested article: log a deflection
  // (best-effort) and close without creating a ticket.
  const markDeflected = (slug: string, categoryId: string) => {
    void apiFetch('/api/support/help-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'deflection',
        slug,
        categoryId,
        query: description.trim().slice(0, 300),
      }),
    }).catch(() => {
      // Best-effort telemetry; never block the user.
    });
    close();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Please describe the issue.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');

      const response = await apiFetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Bug: ${description.slice(0, 60)}`,
          description,
          priority: 'medium',
          category: 'bug',
          tags: ['bug-report'],
          reporterName: name || null,
          reporterEmail: email || null,
          screenshot: screenshot || null,
          screenshotName: screenshotName || null,
          pageUrl: window.location.href,
        }),
      });

      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;

      // The submission is only reported as successful when the server actually
      // stored the ticket. Swallowing the failure here silently loses reports.
      if (!response.ok) {
        setError(
          body?.message ||
            body?.error ||
            (response.status === 429
              ? 'Too many reports sent. Please wait a moment and try again.'
              : 'Failed to submit. Please try again.'),
        );
        return;
      }

      const client = Sentry.getClient();
      if (client) {
        Sentry.captureMessage(`Bug Report: ${description.slice(0, 80)}`, {
          level: 'info',
          extra: {
            reporterName: name || 'Anonymous',
            reporterEmail: email || 'Not provided',
            description,
            url: window.location.href,
            userAgent: navigator.userAgent,
            hasScreenshot: Boolean(screenshot),
          },
        });
      }

      setSubmitted(true);
    } catch {
      setError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Report a Bug"
        className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center
          justify-center rounded-xl border border-[var(--border-subtle)]
          bg-[var(--surface-card)] text-[var(--text-muted)] shadow-lg
          hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]
          transition-colors"
      >
        <Bug className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="absolute inset-0 bg-black/50" />

          <div className="relative w-full max-w-md rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
              <div>
                <h2 className="font-bold text-[var(--text-primary)]">Report a Bug</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Help us improve by reporting issues.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close bug report"
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--surface-muted)] transition-colors"
              >
                <X className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              {submitted ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <CheckCircle className="h-12 w-12 text-green-500" />
                  <p className="font-semibold text-[var(--text-primary)]">Report submitted!</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    Thank you. Our team will investigate this issue.
                  </p>
                  <button type="button" onClick={close} className="btn mt-2 w-full">
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                        Your Name
                      </label>
                      <input
                        type="text"
                        className="input w-full"
                        placeholder="Optional"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        className="input w-full"
                        placeholder="Optional"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-primary)] mb-1">
                      Describe the issue
                      <span className="text-[var(--danger)] ml-1">*</span>
                    </label>
                    <textarea
                      className="input w-full resize-none"
                      rows={4}
                      placeholder="What happened? What did you expect?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                    />
                  </div>

                  {/* Deflection: help articles that may already answer this,
                      shown before a ticket is created. */}
                  {suggestions.length > 0 && (
                    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
                      <div className="mb-2 flex items-center gap-1.5">
                        <Lightbulb className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                        <p className="text-xs font-semibold text-[var(--text-primary)]">
                          These might help — before you send
                        </p>
                      </div>
                      <ul className="space-y-1.5">
                        {suggestions.map((article) => (
                          <li key={`${article.categoryId}/${article.slug}`}>
                            <a
                              href={`/help/${article.categoryId}/${article.slug}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => markDeflected(article.slug, article.categoryId)}
                              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-card)] transition-colors"
                            >
                              <span className="truncate">{article.title}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 text-[var(--text-muted)]" />
                            </a>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => setSuggestionsDismissed(true)}
                        className="mt-2 text-xs text-[var(--text-muted)] underline hover:text-[var(--text-primary)]"
                      >
                        None of these — continue reporting
                      </button>
                    </div>
                  )}

                  {/* Screenshot section */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-primary)] mb-2">
                      Screenshot{' '}
                      <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                    </label>

                    {screenshot ? (
                      <div className="relative rounded-lg overflow-hidden border border-[var(--border-subtle)]">
                        <img
                          src={screenshot}
                          alt="Screenshot"
                          className="w-full max-h-40 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setScreenshot(null);
                            setScreenshotName('');
                          }}
                          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <p className="text-xs text-[var(--text-muted)] px-3 py-2 bg-[var(--surface-muted)]">
                          {screenshotName}
                        </p>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={captureScreen}
                          disabled={capturing}
                          className="btn ghost flex-1 flex items-center justify-center gap-2 text-xs"
                        >
                          {capturing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Camera className="h-3.5 w-3.5" />
                          )}
                          {capturing ? 'Capturing...' : 'Capture Screen'}
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="btn ghost flex-1 text-xs"
                        >
                          Upload Image
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                      </div>
                    )}
                  </div>

                  {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={close} className="btn ghost flex-1">
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn flex-1"
                      disabled={submitting || !description.trim()}
                    >
                      {submitting ? 'Sending...' : 'Send Report'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
