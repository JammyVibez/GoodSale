import { ImageResponse } from 'next/og';

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = 'image/png';

export function renderOgImage(title: string, subtitle: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#032214',
          padding: '64px 72px',
          color: '#fbf9f3',
          position: 'relative',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: -120,
            top: -120,
            width: 520,
            height: 520,
            borderRadius: 520,
            background: 'linear-gradient(135deg, rgba(212,175,55,0.32) 0%, rgba(3,34,20,0) 68%)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: '#d4af37',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#032214',
              fontSize: 40,
              fontWeight: 900,
            }}
          >
            G
          </div>
          <div style={{ display: 'flex', fontSize: 38, fontWeight: 800, letterSpacing: -1 }}>
            <span>Good</span>
            <span style={{ color: '#d4af37' }}>Sale</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 980 }}>
          <div style={{ fontSize: 68, fontWeight: 900, lineHeight: 1.05, letterSpacing: -2 }}>{title}</div>
          <div style={{ fontSize: 28, color: 'rgba(232,239,233,0.72)', lineHeight: 1.35 }}>{subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {['Escrow protected', 'Verified sellers', 'Nationwide delivery'].map((chip) => (
            <div
              key={chip}
              style={{
                border: '1px solid rgba(255,255,255,0.22)',
                borderRadius: 999,
                padding: '10px 20px',
                fontSize: 22,
                color: 'rgba(232,239,233,0.85)',
              }}
            >
              {chip}
            </div>
          ))}
        </div>
      </div>
    ),
    ogSize
  );
}
