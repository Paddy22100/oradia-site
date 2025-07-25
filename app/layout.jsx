import "./globals.css";
import Link from "next/link";

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <header className="fixed top-0 w-full bg-black/50 backdrop-blur-md shadow-lg z-50">
          <nav className="flex justify-center gap-6 py-4 text-lg font-bold">
            <Link href="/" className="hover:text-oradiaViolet">Accueil</Link>
            <Link href="/about" className="hover:text-oradiaViolet">Ã€ propos</Link>
            <Link href="/services" className="hover:text-oradiaViolet">Accompagnements</Link>
            <Link href="/oracle" className="hover:text-oradiaViolet">Oracle Oradia</Link>
            <Link href="/contact" className="hover:text-oradiaViolet">Contact</Link>
            <Link href="/test" className="hover:text-oradiaViolet">test</Link>
</nav>
</header>
        <main className="pt-24">{children}</main>
        <footer className="text-center py-4 mt-8 text-sm bg-black/30">
          Â© {new Date().getFullYear()} Oradia â€“ Tous droits rÃ©servÃ©s.
        </footer>
      </body>
    </html>
  );
}
