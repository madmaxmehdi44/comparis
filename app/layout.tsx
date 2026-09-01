import './globals.css';
import './playwright-lab.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Comparis — مقایسه زنده قیمت',
  description: 'جست‌وجوی زنده محصولات در فروشگاه‌های ایرانی',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
