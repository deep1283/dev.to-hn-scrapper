import type { Metadata } from 'next'
import { Playfair_Display, Inter, Caveat } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const playfair = Playfair_Display({ 
  subsets: ['latin'],
  variable: '--font-serif',
})

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-sans',
})

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-handwriting',
})

const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const metadataBase = new URL(appUrl)
const defaultTitle = 'Signalze | Monitor HN, Dev.to, and GitHub Discussions'
const defaultDescription =
  'Monitor HN, dev.to and GitHub Discussions for your brand or keywords. Engage early, grow faster.'

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: defaultTitle,
    template: '%s | Signalze',
  },
  description: defaultDescription,
  applicationName: 'Signalze',
  alternates: {
    canonical: '/',
  },
  keywords: [
    'brand monitoring',
    'mention tracking',
    'hacker news monitoring',
    'dev.to monitoring',
    'github discussions monitoring',
    'keyword alerts',
  ],
  authors: [{ name: 'Signalze' }],
  creator: 'Signalze',
  publisher: 'Signalze',
  openGraph: {
    type: 'website',
    url: '/',
    title: defaultTitle,
    description: defaultDescription,
    siteName: 'Signalze',
    locale: 'en_US',
    images: [
      {
        url: '/logo.png',
        width: 640,
        height: 640,
        alt: 'Signalze logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: defaultTitle,
    description: defaultDescription,
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-light-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/logo.png', sizes: '180x180', type: 'image/png' }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} ${caveat.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
