'use client';

import { useEffect, useRef } from 'react';

type SwaggerWindow = Window & {
  SwaggerUIBundle?: (args: {
    domNode: Element;
    url: string;
    deepLinking: boolean;
    presets?: unknown[];
    layout?: string;
  }) => void;
  SwaggerUIStandalonePreset?: unknown;
};

export type SwaggerUiProps = {
  /** URL serving OpenAPI YAML contract. */
  specUrl: string;
};

/**
 * Renders Swagger UI without adding new npm dependencies.
 */
export function SwaggerUi({ specUrl }: SwaggerUiProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const initSwagger = async () => {
      await loadStyles();
      await loadScript('https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js');
      await loadScript('https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js');

      if (cancelled || !mountRef.current) {
        return;
      }

      const swaggerWindow = window as SwaggerWindow;
      swaggerWindow.SwaggerUIBundle?.({
        domNode: mountRef.current,
        url: specUrl,
        deepLinking: true,
        presets: swaggerWindow.SwaggerUIStandalonePreset
          ? [swaggerWindow.SwaggerUIStandalonePreset]
          : undefined,
        layout: 'StandaloneLayout',
      });
    };

    void initSwagger();

    return () => {
      cancelled = true;
    };
  }, [specUrl]);

  return <div ref={mountRef} className="min-h-[70vh]" />;
}

/**
 * Loads Swagger UI stylesheet once per session.
 */
async function loadStyles() {
  const styleId = 'swagger-ui-style';
  if (document.getElementById(styleId)) {
    return;
  }

  const link = document.createElement('link');
  link.id = styleId;
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css';
  document.head.appendChild(link);
}

/**
 * Loads an external script if missing.
 * @param src script source URL
 */
async function loadScript(src: string) {
  if (document.querySelector(`script[src=\"${src}\"]`)) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(script);
  });
}
