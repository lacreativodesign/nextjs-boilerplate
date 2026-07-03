'use client';

import Script from 'next/script';

const crispWebsiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;

export function CrispChatWidget() {
  if (!crispWebsiteId) return null;

  return (
    <Script
      id="crisp-chat"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `window.$crisp=[];window.CRISP_WEBSITE_ID=${JSON.stringify(crispWebsiteId)};(function(){var d=document;var s=d.createElement('script');s.src='https://client.crisp.chat/l.js';s.async=1;d.getElementsByTagName('head')[0].appendChild(s);})();`,
      }}
    />
  );
}
