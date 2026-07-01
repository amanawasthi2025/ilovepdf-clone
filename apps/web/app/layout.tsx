import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'
import Nav from '@/components/nav'

export const metadata: Metadata = {
  title: 'PDF Tools',
  description: 'Fast, free PDF tools in your browser',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
