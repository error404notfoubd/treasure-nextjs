import Link from 'next/link';
import GAME_CONFIG from '@/lib/controls';

export default function LegalPage({ title, intro, sections, lastUpdated }) {
  const { SITE } = GAME_CONFIG;

  return (
    <div className="legal-wrap">
      <div className="legal-card">

        {/* Back link */}
        <Link href="/" className="legal-back">← Back to Game</Link>

        {/* Header */}
        <div className="legal-header">
          <div className="legal-site-name">{SITE.NAME}</div>
          <h1 className="legal-title">{title}</h1>
          <div className="legal-updated">Last updated: {lastUpdated ?? SITE.LAST_UPDATED}</div>
          {intro && <p className="legal-intro">{intro}</p>}
        </div>

        {/* Sections */}
        <div className="legal-body">
          {sections.map((section, i) => (
            <div key={i} className="legal-section">
              <h2 className="legal-section-title">{section.title}</h2>
              {section.paragraphs.map((p, j) => (
                <p key={j} className="legal-p">{p}</p>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="legal-footer">
          <Link href="/" className="legal-back">← Back to Game</Link>
          <span className="legal-divider">|</span>
          <Link href="/privacy" className="legal-back">Privacy Policy</Link>
          <span className="legal-divider">|</span>
          <Link href="/terms" className="legal-back">Terms &amp; Conditions</Link>
        </div>

      </div>
    </div>
  );
}