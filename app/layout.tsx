import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Gevora HRMS — Human Resource Management System',
  description: 'A modern, secure, full-stack HRMS for employee, manager, HR, payroll, and admin workflows.',
  icons: {
    icon: '/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png',
    shortcut: '/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png',
    apple: '/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png',
  },
  openGraph: {
    title: 'Gevora HRMS',
    description: 'The people operating system for modern teams.',
    images: [{ url: '/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [{ url: '/ChatGPT_Image_Aug_19,_2026,_05_07_07_AM.png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
