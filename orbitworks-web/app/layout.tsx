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
    "PIN clock-in time tracking for job-site crews. Clock employees in and out with photo proof, manage job sites, approve hours, and get payroll-ready reports.",
  keywords: [
    "job site time tracking",
    "construction time clock app",
    "employee clock in app",
    "PIN clock in software",
    "field service workforce management",
    "payroll timesheet software",
    "construction payroll app",
  ],
  openGraph: {
    title: "Orbitsworks - Job Site Workforce Tracking",
    description:
      "PIN clock-in time tracking for job-site crews. Clock employees in and out with photo proof, manage job sites, approve hours, and get payroll-ready reports.",
    url: "https://orbitsworks.com",
    siteName: "Orbitsworks",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Orbitsworks - Job Site Workforce Tracking",
    description:
      "PIN clock-in time tracking for job-site crews. Clock employees in and out with photo proof, manage job sites, approve hours, and get payroll-ready reports.",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Orbitsworks",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, Android, iOS",
  description:
    "PIN clock-in time tracking for job-site crews. Clock employees in and out with photo proof, manage job sites, approve hours, and get payroll-ready reports.",
  url: "https://orbitsworks.com",
  offers: {
    "@type": "Offer",
    category: "SaaS subscription",
  },
  audience: {
    "@type": "Audience",
    audienceType: "Construction and field service businesses",
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
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}