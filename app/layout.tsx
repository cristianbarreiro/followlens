import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'FollowLens · Tus relaciones, en perspectiva',
  description:
    'Analizá tus relaciones de Instagram y compará importaciones. Tus archivos se procesan únicamente en tu navegador.',
};
const themeInitScript = `(function(){try{var t=localStorage.getItem('followlens-theme');var d=document.documentElement;if(t==='dark'){d.setAttribute('data-theme','dark');d.classList.add('dark');d.style.colorScheme='dark';}else{d.setAttribute('data-theme','light');d.classList.remove('dark');d.style.colorScheme='light';}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
