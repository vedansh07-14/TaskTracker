import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * This file is web-only and used to configure the root HTML for every web page during static rendering.
 * The contents of this function only run in Node.js environments and do not have access to the DOM or browser APIs.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ backgroundColor: '#0A0A0F', height: '100%' }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <title>Cadence</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root {
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #0A0A0F;
            color: #F0F0F5;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow-x: hidden;
            -webkit-tap-highlight-color: transparent;
          }
          * {
            box-sizing: border-box;
          }
        ` }} />
      </head>
      <body style={{ backgroundColor: '#0A0A0F', height: '100%', margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
