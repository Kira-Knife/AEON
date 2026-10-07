import Image from "next/image";
import Link from "next/link";

const PROBLEMS = [
  {
    label: "Reputation is cheap",
    desc: "New agent identities cost nothing. Registry scores are gameable with no capital at stake.",
  },
  {
    label: "Policies have no teeth",
    desc: "Spending caps live in config files or provider dashboards. Counterparties cannot rely on them.",
  },
  {
    label: "Human approval does not scale",
    desc: "The industry answer is a hard cap and a human above $100/day. That is de-automation.",
  },
];

const HOW = [
  {
    step: "01",
    title: "Declare",
    desc: "An agent publishes a spending limit on-chain and locks a bond in USDC.",
  },
  {
    step: "02",
    title: "Spend",
    desc: "Every payment flows through the verifier, which records cumulative spend per period.",
  },
  {
    step: "03",
    title: "Prove",
    desc: "If the agent overspends, anyone compares on-chain sums. No oracle, no judge needed.",
  },
  {
    step: "04",
    title: "Burn",
    desc: "The penalty is burned automatically. No beneficiary means no incentive to entrap agents.",
  },
];

export default function Landing() {
  return (
    <div style={{ background: "#fff", color: "var(--text-primary)", minHeight: "100vh" }}>

      {/* Nav */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border)",
        padding: "0 40px", height: 56,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <Image src="/logo-credit-card.png" alt="AEON" width={28} height={28} style={{ objectFit: "contain" }} />
        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>AEON</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginRight: 8 }}>Base Sepolia testnet</span>
        <Link href="/mockup" style={{
          padding: "8px 14px", borderRadius: 9999,
          background: "var(--bg-card-2)", color: "var(--text-secondary)",
          fontSize: 13, fontWeight: 500, textDecoration: "none",
          border: "1px solid var(--border)", marginRight: 8,
        }}>
          Mockup
        </Link>
        <Link href="/app" style={{
          padding: "8px 18px", borderRadius: 9999,
          background: "var(--blue)", color: "#fff",
          fontSize: 13, fontWeight: 600, textDecoration: "none",
        }}>
          Open App
        </Link>
      </nav>

      {/* Hero */}
      <section style={{
        borderBottom: "1px solid var(--border)",
        background: "linear-gradient(135deg, #ffffff 0%, #eef1f8 60%, #e8edf7 100%)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 48,
          maxWidth: 1100, margin: "0 auto",
          padding: "80px 40px 72px",
          flexWrap: "wrap",
        }}>
          {/* Left: text */}
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 12px", borderRadius: 9999,
              background: "var(--blue-dim)", color: "var(--blue)",
              fontSize: 12, fontWeight: 600, marginBottom: 24,
              border: "1px solid var(--blue-mid)",
            }}>
              TOKEN2049 Origins Hackathon 2026
            </div>
            <h1 style={{
              fontSize: 52, fontWeight: 800, lineHeight: 1.1,
              letterSpacing: "-0.03em", marginBottom: 20,
              color: "var(--text-primary)",
            }}>
              Capital on the Loop
            </h1>
            <p style={{
              fontSize: 18, color: "var(--text-secondary)",
              lineHeight: 1.6, marginBottom: 36, fontWeight: 400, maxWidth: 460,
            }}>
              AI agents already move real money. Nothing economically backs their behavior.
              AEON lets an agent publish an on-chain spending limit and back it with a bond.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/app" style={{
                padding: "12px 28px", borderRadius: 9999,
                background: "var(--blue)", color: "#fff",
                fontSize: 15, fontWeight: 600, textDecoration: "none",
              }}>
                View Live Demo
              </Link>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" style={{
                padding: "12px 28px", borderRadius: 9999,
                background: "rgba(255,255,255,0.7)", color: "var(--text-secondary)",
                fontSize: 15, fontWeight: 500, textDecoration: "none",
                border: "1px solid var(--border)",
              }}>
                GitHub
              </a>
            </div>
          </div>

          {/* Right: hero illustration */}
          <div style={{ flexShrink: 0 }}>
            <Image
              src="/hero-trp.png"
              alt="AEON bond vault diagram"
              width={480}
              height={520}
              style={{
                objectFit: "contain", maxWidth: "100%",
                maskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)",
                WebkitMaskImage: "radial-gradient(ellipse 88% 88% at 50% 50%, black 55%, transparent 100%)",
              }}
              priority
            />
          </div>
        </div>
      </section>

      {/* Problems */}
      <section style={{
        position: "relative", overflow: "hidden",
        padding: "80px 24px",
      }}>
        {/* Decorative overlay — credit card mascot */}
        <Image
          src="/mascot-credit-card.png"
          alt="" aria-hidden="true" width={360} height={360}
          style={{
            position: "absolute", right: -40, top: "50%",
            transform: "translateY(-50%)",
            opacity: 0.06, filter: "blur(1px)",
            pointerEvents: "none", userSelect: "none",
          }}
        />

        <div style={{ maxWidth: 960, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
            The Problem
          </p>
          <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 48 }}>
            Agent payments have no economic backing
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {PROBLEMS.map((p, i) => (
              <div key={i} style={{
                background: "var(--bg-card-2)", border: "1px solid var(--border)",
                borderRadius: 14, padding: "24px",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "var(--blue-dim)", color: "var(--blue)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, marginBottom: 14,
                }}>
                  P{i + 1}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{p.label}</h3>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{
        background: "var(--bg-card-2)",
        borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
        padding: "80px 24px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Decorative overlay — credit card */}
        <Image
          src="/credit-card.png"
          alt="" aria-hidden="true" width={320} height={320}
          style={{
            position: "absolute", left: -40, bottom: -40,
            opacity: 0.06, filter: "blur(1px)",
            pointerEvents: "none", userSelect: "none",
          }}
        />

        <div style={{ maxWidth: 960, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
            How it works
          </p>
          <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 48 }}>
            Four steps, no oracle, no judge
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {HOW.map((h) => (
              <div key={h.step} style={{
                background: "#fff", border: "1px solid var(--border)",
                borderRadius: 14, padding: "24px",
              }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--blue)", fontWeight: 700, marginBottom: 12 }}>
                  {h.step}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{h.title}</h3>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                  {h.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 640, margin: "0 auto", padding: "96px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 16 }}>
          See it live on Base Sepolia
        </h2>
        <p style={{ fontSize: 16, color: "var(--text-secondary)", marginBottom: 36, lineHeight: 1.6 }}>
          Real declare, payment, flag and burn transactions. Every number links to Basescan.
        </p>
        <Link href="/app" style={{
          padding: "14px 36px", borderRadius: 9999,
          background: "var(--blue)", color: "#fff",
          fontSize: 16, fontWeight: 700, textDecoration: "none",
          display: "inline-block", marginRight: 12,
        }}>
          Open App
        </Link>
        <Link href="/mockup" style={{
          padding: "14px 36px", borderRadius: 9999,
          background: "transparent", color: "var(--text-secondary)",
          fontSize: 16, fontWeight: 500, textDecoration: "none",
          display: "inline-block", border: "1px solid var(--border)",
        }}>
          View Mockup
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid var(--border)",
        padding: "24px 40px",
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <Image src="/logo-credit-card.png" alt="AEON" width={20} height={20} style={{ objectFit: "contain", opacity: 0.5 }} />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>AEON</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          TOKEN2049 Origins 2026 · Base Sepolia testnet only · No real funds
        </span>
      </footer>
    </div>
  );
}
