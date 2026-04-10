import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: "CFG Eval Toy",
  description: "Natural-language queries against orders, via GPT-5 context-free grammar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script defer data-domain="raindrop-cfg-eval-toy.vercel.app" src="https://plausible.ryo.wtf/js/script.js"></script>
      </head>
      <body
        style={{
          fontFamily:
            'var(--font-inter), -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif',
          margin: 0,
          padding: 0,
          background: "#fafaf7",
          color: "#0b1220",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {children}
      </body>
    </html>
  );
}
