'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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

type SwaggerVersion = {
  label: string;
  value: string;
};

export type SwaggerUiProps = {
  defaultVersion: string;
  versions: SwaggerVersion[];
};

/**
 * Renders Swagger UI with API version selection.
 */
export function SwaggerUi({ defaultVersion, versions }: SwaggerUiProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [selectedVersion, setSelectedVersion] = useState(defaultVersion);

  const specUrl = useMemo(
    () => `/api/openapi?version=${encodeURIComponent(selectedVersion)}`,
    [selectedVersion],
  );

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

  return (
    <section>
      <label htmlFor="api-version" className="mb-2 block text-sm font-medium text-gray-700">
        API Version
      </label>
      <select
        id="api-version"
        className="mb-6 w-64 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        value={selectedVersion}
        onChange={(event) => setSelectedVersion(event.target.value)}
      >
        {versions.map((version) => (
          <option key={version.value} value={version.value}>
            {version.label}
          </option>
        ))}
      </select>
      <div ref={mountRef} className="min-h-[70vh]" />
    </section>
  );
}

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
