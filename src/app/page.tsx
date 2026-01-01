'use client';

import CallPad from './components/CallPad';

export default function HomePage() {
  return (
    <>
      <style jsx global>{`
        @keyframes instructionPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.5);
          }
          70% {
            box-shadow: 0 0 0 14px rgba(249, 115, 22, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
          }
        }
      `}</style>
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #04050a, #0f172a 45%, #1e1b4b)',
          padding: '20px 0 120px',
        }}
      >
        <main
          style={{
            maxWidth: 1500,
            margin: '0 auto',
            padding: '0 16px',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          <CallPad />
        </main>
      </div>
    </>
  );
}
