import { generatePreviewPayload, renderTemplate } from "@/lib/email/template-engine";

describe("email template engine", () => {
  it("replaces merge tags and conditionals", () => {
    const out = renderTemplate({
      template: {
        subject: "Invoice {{invoice.number}}",
        body: "<p>{{client.name}}</p>{{#if approval.comment}}<p>{{approval.comment}}</p>{{/if}}",
        language: "en",
        translations: {},
      },
      context: generatePreviewPayload(),
    });

    expect(out.renderedSubject).toContain("INV-2026-0031");
    expect(out.renderedHtml).toContain("Global Ventures Ltd");
    expect(out.renderedHtml).toContain("Approved with coverage");
  });

  it("renders each blocks", () => {
    const out = renderTemplate({
      template: {
        subject: "Summary",
        body: "<ul>{{#each project.highlights}}<li>{{this}}</li>{{/each}}</ul>",
        language: "en",
        translations: {},
      },
      context: generatePreviewPayload(),
    });

    expect(out.renderedHtml).toContain("Homepage complete");
    expect(out.renderedHtml).toContain("Client review this Friday");
  });

  it("uses localized translation when locale is present", () => {
    const out = renderTemplate({
      template: {
        subject: "Hello {{client.name}}",
        body: "<p>Default</p>",
        language: "en",
        translations: {
          es: {
            subject: "Hola {{client.name}}",
            body: "<p>Hola {{client.name}}</p>",
          },
        },
      },
      context: generatePreviewPayload(),
      locale: "es",
    });

    expect(out.locale).toBe("es");
    expect(out.renderedSubject).toContain("Hola");
    expect(out.renderedHtml).toContain("Hola Global Ventures Ltd");
  });
});
