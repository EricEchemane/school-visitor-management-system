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
            Bottom-left: every row action (Check in, Check out, Cancel) sits on the right. */}
        <Toaster richColors closeButton position="bottom-left" />
      </body>
    </html>
  );
}
