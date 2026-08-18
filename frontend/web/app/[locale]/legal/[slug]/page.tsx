import Link from "next/link";
import { notFound } from "next/navigation";

type Doc = { title: string; updated: string; intro: string; sections: { h: string; p: string }[] };

const DOCS: Record<string, Doc> = {
  privacy: {
    title: "Privacy Policy",
    updated: "June 2026",
    intro:
      "TYRE Technologies Pvt. Ltd. operates a freight platform for Indian road transport. This policy explains what we collect from drivers, brokers and shippers, and how we use it.",
    sections: [
      { h: "What we collect", p: "Name, mobile number, language preference, GSTIN (brokers), vehicle and FASTag details, GPS location while a trip is active, and voice recordings used to match loads. We do not collect data we do not need to move a load." },
      { h: "How we use it", p: "To match loads, release UPI escrow advances, track shipments, verify trust scores, and detect fraud. Location is used only during an active trip. Voice is transcribed for intent and then discarded unless required for a dispute." },
      { h: "Payments & escrow", p: "UPI escrow is operated through an RBI-regulated partner (Razorpay Route). We never store full bank credentials; settlement identifiers (UTR) are retained for reconciliation and audit." },
      { h: "Your rights", p: "You can request a copy or deletion of your data by writing to privacy@tyre.in. We respond within 30 days, subject to legal retention requirements for financial records." },
    ],
  },
  terms: {
    title: "Terms of Service",
    updated: "June 2026",
    intro: "By using TYRE you agree to these terms. TYRE is a marketplace and operating system; the contract of carriage is between the broker/shipper and the carrier/driver.",
    sections: [
      { h: "Accounts", p: "You must provide accurate identity and vehicle information. Brokers must hold a valid GSTIN. Accounts that fail fraud checks may be suspended." },
      { h: "Payments", p: "Advances and balances are released via UPI escrow on the milestones shown in the app (load accept, GPS-verified POD, consignee confirm). TYRE charges a transparent take rate disclosed before acceptance." },
      { h: "Acceptable use", p: "No fraudulent loads, fake PODs, or manipulation of GPS/trust signals. Violations forfeit escrow and may be reported to authorities." },
      { h: "Liability", p: "TYRE facilitates matching and payments; it is not the carrier. Liability for loss or damage in transit rests with the parties to the carriage contract, subject to applicable law." },
    ],
  },
  escrow: {
    title: "RBI Escrow Policy",
    updated: "June 2026",
    intro: "How TYRE handles money in transit, in line with RBI guidance on payment aggregators and escrow.",
    sections: [
      { h: "Regulated partner", p: "All funds flow through an RBI-authorised payment aggregator's escrow (Razorpay Route). TYRE never commingles user funds with operating funds." },
      { h: "Release milestones", p: "The ₹10,000 advance releases on load acceptance. The balance releases on a GPS-verified proof-of-delivery plus a one-tap consignee confirmation. Disputes pause release pending review." },
      { h: "Refunds & disputes", p: "If a load is cancelled before pickup, the advance is reversed to the source within the partner's SLA. Disputes are reviewed within 48 hours using trip telemetry and POD evidence." },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS[slug];
  if (!doc) notFound();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <Link href="/" className="text-[13px] text-[var(--muted-foreground)] hover:text-[var(--tyre-ink)] transition-colors">
          ← Back to TYRE
        </Link>
        <h1 className="tyre-display text-[clamp(2rem,1.5rem+2vw,3rem)] text-[var(--tyre-ink)] mt-8">{doc.title}</h1>
        <div className="text-[12.5px] text-[var(--muted-foreground)] mt-2">Last updated {doc.updated}</div>
        <p className="text-[15px] text-[var(--muted-foreground)] leading-relaxed mt-6">{doc.intro}</p>

        <div className="mt-10 space-y-8">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-[17px] font-semibold text-[var(--tyre-ink)]">{s.h}</h2>
              <p className="text-[14.5px] text-[var(--muted-foreground)] leading-relaxed mt-2">{s.p}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--border)] text-[13px] text-[var(--muted-foreground)]">
          Questions? <a href="mailto:legal@tyre.in" className="text-[var(--tyre-green-deep)] tyre-link">legal@tyre.in</a>
        </div>
      </div>
    </main>
  );
}
