import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://orbitsworks.com"),
  title: {
    default: "Orbitsworks - Job Site Workforce Tracking",
    template: "%s | Orbitsworks",
  },
  description:
    "Face-verified time tracking for job-site crews. Clock employees in and out with photo verification, manage job sites, and get payroll-ready reports.",
  openGraph: {
    title: "Orbitsworks - Job Site Workforce Tracking",
    description:
      "Face-verified time tracking for job-site crews. Clock employees in and out with photo verification, manage job sites, and get payroll-ready reports.",
    url: "https://orbitsworks.com",
    siteName: "Orbitsworks",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Orbitsworks - Job Site Workforce Tracking",
    description:
      "Face-verified time tracking for job-site crews. Clock employees in and out with photo verification, manage job sites, and get payroll-ready reports.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
