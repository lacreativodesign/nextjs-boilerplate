import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const BLOCKED_EXTENSIONS = [
  { ext: ".exe", name: "malware.exe", mime: "application/octet-stream" },
  { ext: ".bat", name: "script.bat", mime: "application/x-bat" },
  { ext: ".sh", name: "script.sh", mime: "application/x-sh" },
];

const UPLOAD_ENDPOINT = `${BASE_URL}/api/admin/upload`;

test.describe("File upload validation", () => {
  for (const { ext, name, mime } of BLOCKED_EXTENSIONS) {
    test(`Upload of ${ext} file is rejected`, async ({ request }) => {
      const fileContent = Buffer.from(`fake content for ${ext} test`);

      const response = await request.post(UPLOAD_ENDPOINT, {
        multipart: {
          file: {
            name,
            mimeType: mime,
            buffer: fileContent,
          },
        },
        failOnStatusCode: false,
      });

      // Must not return 2xx for blocked extensions — 400, 401, 403, or 422 expected
      expect(response.status()).not.toBeGreaterThanOrEqual(200);
      // More precisely: status must be 4xx or 5xx
      expect(response.status()).toBeGreaterThanOrEqual(400);
    });
  }

  test("Oversized file (>25MB) is rejected", async ({ request }) => {
    // Create a 26MB buffer
    const oversizedBuffer = Buffer.alloc(26 * 1024 * 1024, "a");

    const response = await request.post(UPLOAD_ENDPOINT, {
      multipart: {
        file: {
          name: "oversized.pdf",
          mimeType: "application/pdf",
          buffer: oversizedBuffer,
        },
      },
      failOnStatusCode: false,
      // Allow extra time for large payload
      timeout: 30000,
    });

    // Must reject oversized uploads with 400, 401, 403, or 413 (Payload Too Large)
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });
});
