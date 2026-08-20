import Image from "next/image";
import Link from "next/link";

/**
 * Version metadata for the public policy pages. Each page is versioned so a
 * store reviewer, or a learner comparing the app against the site, can tell
 * which revision they are reading. Bump `version` and `effective` together
 * whenever the wording of a document changes in substance.
 */
export const policyDocuments = {
  privacy: {
    href: "/privacy",
    label: "Privacy",
    title: "Privacy policy",
    lead: "How Bolo handles what stays on your device and what optional AI coaching sends.",
    version: "2026-07-16",
    effective: "July 16, 2026",
    /** Must match AI_CONSENT_VERSION in ../../src/lib/storage.ts. */
    aiConsentVersion: 8,
  },
  terms: {
    href: "/terms",
    label: "Terms",
    title: "Terms of use",
    lead: "The agreement that covers using Bolo and its optional AI coaching.",
    version: "2026-08-20",
    effective: "August 20, 2026",
  },
  support: {
    href: "/support",
    label: "Support",
    title: "Support",
    lead: "Fix a problem, control your data, or reach a person.",
    version: "2026-08-20",
    effective: "August 20, 2026",
  },
} as const;

export type PolicyKey = keyof typeof policyDocuments;

export function policyMetadata(key: PolicyKey) {
  const document = policyDocuments[key];
  return {
    title: `Bolo — ${document.title}`,
    description: document.lead,
  };
}

export function PolicyPage({ children, page }: { children: React.ReactNode; page: PolicyKey }) {
  const document = policyDocuments[page];
  return (
    <main className="policy">
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Bolo home">
          <Image src="/bolo-icon.png" alt="" width={48} height={48} />
          <span className="brand-name">Bolo</span>
          <span className="brand-tagline">Hindi for real moments</span>
        </Link>
        <nav aria-label="Policy pages">
          {(Object.keys(policyDocuments) as PolicyKey[]).map((key) => (
            <Link aria-current={key === page ? "page" : undefined} href={policyDocuments[key].href} key={key}>{policyDocuments[key].label}</Link>
          ))}
        </nav>
      </header>

      <article className="policy-shell">
        <p className="eyebrow"><span />Bolo public pages</p>
        <h1>{document.title}</h1>
        <p className="policy-lead">{document.lead}</p>
        <p className="policy-version">Version {document.version} · Effective {document.effective}</p>
        {children}
      </article>

      <footer>
        <Link className="brand footer-brand" href="/"><Image src="/bolo-icon.png" alt="" width={44} height={44} /><span className="brand-name">Bolo</span></Link>
        <p>Hindi for real moments.</p>
        <div>{(Object.keys(policyDocuments) as PolicyKey[]).map((key) => (
          <Link href={policyDocuments[key].href} key={key}>{policyDocuments[key].label}</Link>
        ))}</div>
      </footer>
    </main>
  );
}

export function PolicySection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="policy-section"><h2>{title}</h2>{children}</section>;
}
