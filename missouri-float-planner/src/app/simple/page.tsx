// src/app/simple/page.tsx
// Ultra-simple page to test if routing works at all

export default function SimplePage() {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Simple Page Works!</h1>
      <p>If you can see this, routing is working.</p>
      <p>Timestamp: {new Date().toISOString()}</p>
    </div>
  );
}
