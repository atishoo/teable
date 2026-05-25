import type { DocumentProps } from 'next/document';
import Document, { Html, Main, Head, NextScript } from 'next/document';

type Props = DocumentProps & {
  emotionStyleTags?: string[];
};

class MyDocument extends Document<Props> {
  render() {
    const locale = this.props.locale;

    return (
      <Html lang={locale}>
        <Head>
          <meta charSet="utf-8" />
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/images/favicon/apple-touch-icon.png"
          />
          <link rel="icon" href="/api/admin/setting/favicon" />
          <link rel="shortcut icon" href="/api/admin/setting/favicon" />
          <link rel="manifest" href="/images/favicon/site.webmanifest" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

// Example to process graceful shutdowns (ie: closing db or other resources)
// https://nextjs.org/docs/deployment#manual-graceful-shutdowns
if (process.env.NEXT_MANUAL_SIG_HANDLE) {
  // this should be added in your custom _document
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM: ', 'cleaning up');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT: ', 'cleaning up');
    process.exit(0);
  });
}

export default MyDocument;
