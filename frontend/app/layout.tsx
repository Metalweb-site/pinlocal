import type { Metadata, Viewport } from 'next'
import { Toaster } from 'react-hot-toast'
import LoadingBar from '@/components/shared/LoadingBar'
import './globals.css'

export const metadata: Metadata = {
  title: 'PinLocal — Your Neighbourhood, Your Groups',
  description: 'Connect with real people in your pincode. Discover local groups, join conversations.',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#0F0F0F',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text1 font-body antialiased overflow-x-hidden">
        <LoadingBar />
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#1A1A1A',
              color: '#F0EDE8',
              border: '1px solid #2A2A2A',
              borderRadius: '12px',
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '13px',
            },
            success: { iconTheme: { primary: '#00FFB2', secondary: '#0F0F0F' } },
            error:   { iconTheme: { primary: '#FF4D00', secondary: '#0F0F0F' } },
          }}
        />
      </body>
    </html>
  )
}
