import type { Metadata } from 'next';import './globals.css';
export const metadata:Metadata={title:'Classroom Studio | Excel & Attendance',description:'Generate verified Business Spreadsheet variants and manage QR attendance.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
