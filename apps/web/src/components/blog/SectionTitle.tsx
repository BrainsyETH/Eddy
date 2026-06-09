// src/components/blog/SectionTitle.tsx
// Eyebrow + h2 + 48x3 coral underline rule. Used as the section header
// throughout the river guide layout.

interface Props {
  id?: string;
  eyebrow?: string;
  children: React.ReactNode;
}

export default function SectionTitle({ id, eyebrow, children }: Props) {
  return (
    <div
      id={id}
      style={{
        marginTop: 56,
        marginBottom: 22,
        scrollMarginTop: 80,
      }}
    >
      {eyebrow && (
        <div
          className="eyebrow"
          style={{
            color: 'var(--color-accent-600)',
            marginBottom: 8,
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.12em',
          }}
        >
          {eyebrow}
        </div>
      )}
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 36,
          fontWeight: 600,
          letterSpacing: '-.01em',
          lineHeight: 1.15,
          color: 'var(--color-neutral-900)',
          margin: 0,
        }}
      >
        {children}
      </h2>
      <div
        style={{
          width: 48,
          height: 3,
          background: 'var(--color-accent-500)',
          marginTop: 14,
        }}
      />
    </div>
  );
}
