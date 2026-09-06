import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'FollowLens · Tus relaciones, en perspectiva', description:'Analizá tus relaciones de Instagram y compará importaciones. Tus archivos se procesan únicamente en tu navegador.' };
export default function RootLayout({ children }:Readonly<{children:React.ReactNode}>) { return <html lang="es"><body>{children}</body></html>; }
