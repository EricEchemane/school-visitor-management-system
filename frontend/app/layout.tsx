import { Toaster } from 'sonner';
import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = { title: 'School Visitor Management' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
        {/* Mounted once, outside every page, so toasts survive navigation and never duplicate.
            Styled like the app's cards in globals.css; only the icon carries colour. */}
        <Toaster closeButton position="bottom-center" duration={6000} />
      </body>
    </html>
  );
}
