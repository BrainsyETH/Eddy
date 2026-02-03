import { useState } from "react";

// Collapsible section component
const Section = ({ icon, title, badge, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        borderBottom: "1px solid #e8e4df",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "14px 16px",
          background: open ? "#faf8f5" : "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.15s ease",
        }}
      >
        <span style={{ fontSize: "18px", width: "24px", textAlign: "center" }}>
          {icon}
        </span>
        <span
          style={{
            flex: 1,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            fontSize: "14px",
            color: "#2c2416",
            letterSpacing: "0.01em",
          }}
        >
          {title}
        </span>
        {badge && (
          <span
            style={{
              fontSize: "11px",
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: "10px",
              background: badge.bg,
              color: badge.color,
            }}
          >
            {badge.label}
          </span>
        )}
        <span
          style={{
            fontSize: "13px",
            color: "#a09888",
            transition: "transform 0.2s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▾
        </span>
      </button>
      <div
        style={{
          maxHeight: open ? "600px" : "0",
          opacity: open ? 1 : 0,
          transition: "max-height 0.3s ease, opacity 0.2s ease",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "4px 16px 16px 50px" }}>{children}</div>
      </div>
    </div>
  );
};

// Info row inside sections
const InfoRow = ({ label, value, href, subtle }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      padding: "6px 0",
      gap: "12px",
    }}
  >
    <span
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: "13px",
        color: "#8a7e70",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
    {href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "13px",
          color: "#3d7c47",
          fontWeight: 500,
          textAlign: "right",
          textDecoration: "none",
          borderBottom: "1px dotted #3d7c4766",
        }}
      >
        {value} ↗
      </a>
    ) : (
      <span
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "13px",
          color: subtle ? "#a09888" : "#2c2416",
          fontWeight: subtle ? 400 : 500,
          textAlign: "right",
          lineHeight: "1.4",
        }}
      >
        {value}
      </span>
    )}
  </div>
);

// Tip callout component
const Tip = ({ children }) => (
  <div
    style={{
      display: "flex",
      gap: "8px",
      background: "#f0ebe3",
      borderRadius: "8px",
      padding: "10px 12px",
      marginTop: "8px",
    }}
  >
    <span style={{ fontSize: "14px", flexShrink: 0, marginTop: "1px" }}>🦦</span>
    <span
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: "12px",
        color: "#5a4f40",
        lineHeight: "1.5",
        fontStyle: "italic",
      }}
    >
      {children}
    </span>
  </div>
);

// Nav button for external apps
const NavButton = ({ icon, label, subtitle, onClick }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "4px",
      padding: "12px 8px",
      background: "#faf8f5",
      border: "1.5px solid #e8e4df",
      borderRadius: "10px",
      cursor: "pointer",
      transition: "all 0.15s ease",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = "#3d7c47";
      e.currentTarget.style.background = "#f5faf6";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = "#e8e4df";
      e.currentTarget.style.background = "#faf8f5";
    }}
  >
    <span style={{ fontSize: "20px" }}>{icon}</span>
    <span
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: "12px",
        fontWeight: 600,
        color: "#2c2416",
      }}
    >
      {label}
    </span>
    {subtitle && (
      <span
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "10px",
          color: "#a09888",
        }}
      >
        {subtitle}
      </span>
    )}
  </button>
);

// Status gauge mini component
const GaugeStatus = ({ level, cfs, label, trend }) => {
  const colors = {
    "too-low": { bg: "#f5e6e0", bar: "#c4705a", text: "#8b3a24" },
    low: { bg: "#fef3e0", bar: "#d4a244", text: "#8a6a1e" },
    okay: { bg: "#e8f0e3", bar: "#7aab5e", text: "#3d6b24" },
    optimal: { bg: "#e0f0e4", bar: "#3d7c47", text: "#1e5428" },
    high: { bg: "#fef3e0", bar: "#d4a244", text: "#8a6a1e" },
    flood: { bg: "#f5e0e0", bar: "#c45a5a", text: "#8b2424" },
  };
  const c = colors[level] || colors.okay;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 14px",
        background: c.bg,
        borderRadius: "10px",
        border: `1px solid ${c.bar}22`,
      }}
    >
      <div
        style={{
          width: "8px",
          height: "36px",
          borderRadius: "4px",
          background: c.bar,
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "14px",
            fontWeight: 700,
            color: c.text,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "12px",
            color: c.text,
            opacity: 0.75,
          }}
        >
          {cfs} cfs
        </div>
      </div>
      {trend && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
          }}
        >
          <span style={{ fontSize: "16px" }}>
            {trend === "rising" ? "↑" : trend === "falling" ? "↓" : "→"}
          </span>
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "10px",
              color: c.text,
              opacity: 0.7,
            }}
          >
            {trend}
          </span>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────
// Main Access Point Detail Component
// ─────────────────────────────────────────
export default function AccessPointDetail() {
  const [view, setView] = useState("detail"); // 'list' or 'detail'

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f0eb",
        display: "flex",
        justifyContent: "center",
        padding: "20px 12px",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap"
        rel="stylesheet"
      />

      <div style={{ width: "100%", maxWidth: "520px" }}>
        {/* ── Page Label ── */}
        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#a09888",
            marginBottom: "6px",
            padding: "0 4px",
          }}
        >
          Access Point · Huzzah Creek
        </div>

        {/* ── Header Card ── */}
        <div
          style={{
            background: "#fffdf9",
            borderRadius: "16px",
            border: "1px solid #e8e4df",
            overflow: "hidden",
            marginBottom: "12px",
            boxShadow: "0 1px 3px rgba(44,36,22,0.04)",
          }}
        >
          {/* Hero area */}
          <div
            style={{
              position: "relative",
              height: "140px",
              background:
                "linear-gradient(135deg, #3d6b3a 0%, #5a8a4a 50%, #7aab5e 100%)",
              display: "flex",
              alignItems: "flex-end",
              padding: "16px",
            }}
          >
            {/* Decorative river lines */}
            <svg
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                opacity: 0.1,
              }}
            >
              <path
                d="M0,60 Q80,20 160,50 T320,40 T480,55 T640,35"
                stroke="white"
                fill="none"
                strokeWidth="2"
              />
              <path
                d="M0,90 Q100,60 200,85 T400,70 T600,80"
                stroke="white"
                fill="none"
                strokeWidth="1.5"
              />
              <path
                d="M0,110 Q120,90 240,105 T480,95"
                stroke="white"
                fill="none"
                strokeWidth="1"
              />
            </svg>

            <div>
              <h1
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontWeight: 700,
                  fontSize: "22px",
                  color: "white",
                  margin: 0,
                  lineHeight: "1.2",
                  textShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              >
                Davisville Access
              </h1>
              <div
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "13px",
                  color: "rgba(255,255,255,0.8)",
                  marginTop: "4px",
                }}
              >
                River mile 8.2 · Crawford County
              </div>
            </div>
          </div>

          {/* Quick stats bar */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              borderBottom: "1px solid #e8e4df",
            }}
          >
            {[
              { label: "Use as", value: "Put-in / Take-out" },
              { label: "Parking", value: "~15 vehicles" },
              { label: "Road", value: "Gravel (maintained)" },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  padding: "12px",
                  textAlign: "center",
                  borderRight: i < 2 ? "1px solid #e8e4df" : "none",
                }}
              >
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "10px",
                    color: "#a09888",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: "3px",
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#2c2416",
                    lineHeight: "1.3",
                  }}
                >
                  {s.value}
                </div>
              </div>
            ))}
          </div>

          {/* Current conditions - always visible */}
          <div style={{ padding: "14px 16px" }}>
            <GaugeStatus
              level="optimal"
              cfs="285"
              label="Optimal for floating"
              trend="steady"
            />
            <div
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "10px",
                color: "#a09888",
                marginTop: "6px",
                textAlign: "right",
              }}
            >
              USGS 07013000 · Updated 18 min ago
            </div>
          </div>
        </div>

        {/* ── Navigation Buttons ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: "8px",
            marginBottom: "12px",
          }}
        >
          <NavButton icon="🧭" label="Onx" subtitle="Offroad" />
          <NavButton icon="🗺️" label="Gaia" subtitle="GPS" />
          <NavButton icon="📍" label="Google" subtitle="Maps" />
          <NavButton icon="🍎" label="Apple" subtitle="Maps" />
        </div>

        {/* ── Collapsible Sections ── */}
        <div
          style={{
            background: "#fffdf9",
            borderRadius: "16px",
            border: "1px solid #e8e4df",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(44,36,22,0.04)",
          }}
        >
          {/* Getting There */}
          <Section
            icon="🚗"
            title="Getting There"
            badge={{ label: "GRAVEL", bg: "#f0ebe3", color: "#7a6b55" }}
            defaultOpen={true}
          >
            <InfoRow label="From Steelville" value="12 mi · ~25 min" />
            <InfoRow label="Road type" value="Maintained gravel, last 2 mi" />
            <InfoRow label="Clearance" value="Standard vehicles OK when dry" />
            <InfoRow
              label="Coordinates"
              value="37.9847° N, 91.1234° W"
              subtle
            />
            <Tip>
              After rain, the last half mile can get muddy. 4WD or high-clearance
              recommended within 24hrs of heavy rain. There's a cattle gate at
              the turn-off — close it behind you.
            </Tip>
          </Section>

          {/* Parking */}
          <Section icon="🅿️" title="Parking & Loading">
            <InfoRow label="Capacity" value="~15 vehicles" />
            <InfoRow label="Surface" value="Gravel lot" />
            <InfoRow label="Trailer access" value="Yes — turnaround loop" />
            <InfoRow label="Loading zone" value="30 ft carry to water" />
            <Tip>
              Fills up by 9:30am on summer Saturdays. Weekdays and September
              you'll have the lot to yourself.
            </Tip>
          </Section>

          {/* Facilities */}
          <Section
            icon="🏕️"
            title="Facilities"
            badge={{ label: "MDC", bg: "#e0f0e4", color: "#3d7c47" }}
          >
            <InfoRow label="Restrooms" value="Vault toilet (seasonal)" />
            <InfoRow label="Camping" value="Primitive — no fee" />
            <InfoRow label="Water" value="None — pack in" />
            <InfoRow label="Managed by" value="MO Dept. of Conservation" />
            <InfoRow
              label="Official page"
              value="MDC Access Details"
              href="https://mdc.mo.gov"
            />
            <InfoRow
              label="Regulations"
              value="Conservation Area Rules"
              href="https://mdc.mo.gov"
            />
          </Section>

          {/* Shuttle */}
          <Section icon="🚐" title="Shuttle & Outfitters">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {[
                {
                  name: "Ozark Outdoors",
                  serves: "Put-in & take-out",
                  phone: "(573) 245-6514",
                  note: "Runs shuttles daily May–Sept",
                },
                {
                  name: "Huzzah Valley Resort",
                  serves: "Put-in only",
                  phone: "(573) 245-6218",
                  note: "Weekends only after Labor Day",
                },
              ].map((o, i) => (
                <div
                  key={i}
                  style={{
                    padding: "10px 12px",
                    background: "#faf8f5",
                    borderRadius: "8px",
                    border: "1px solid #e8e4df",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#2c2416",
                      }}
                    >
                      {o.name}
                    </span>
                    <a
                      href={`tel:${o.phone}`}
                      style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: "12px",
                        color: "#3d7c47",
                        textDecoration: "none",
                      }}
                    >
                      {o.phone}
                    </a>
                  </div>
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: "11px",
                      color: "#8a7e70",
                      marginTop: "4px",
                    }}
                  >
                    {o.serves} · {o.note}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Water Notes */}
          <Section icon="💧" title="Water Level Notes">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "13px",
                color: "#5a4f40",
                lineHeight: "1.5",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px",
                }}
              >
                {[
                  {
                    level: "Low",
                    note: "Rocky entry. Carry boats 50ft further downstream.",
                    bg: "#fef3e0",
                  },
                  {
                    level: "Optimal",
                    note: "Easy launch right at the ramp. Best conditions.",
                    bg: "#e0f0e4",
                  },
                  {
                    level: "High",
                    note: "Current is swift at entry. Experienced paddlers only.",
                    bg: "#fff3e0",
                  },
                  {
                    level: "Flood",
                    note: "Access road floods. Do not attempt.",
                    bg: "#f5e0e0",
                  },
                ].map((w, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "8px 10px",
                      background: w.bg,
                      borderRadius: "6px",
                      fontSize: "11px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: "2px",
                        fontSize: "12px",
                      }}
                    >
                      {w.level}
                    </div>
                    {w.note}
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* Community Notes */}
          <Section icon="📝" title="Floater Notes" badge={{ label: "3", bg: "#e8e4df", color: "#7a6b55" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {[
                {
                  text: "The riffle just below the access is shallow in July. Stick to river left to avoid scraping.",
                  date: "Aug 2025",
                  author: "Local paddler",
                },
                {
                  text: "Cell service is spotty here. Download your maps before you leave Steelville.",
                  date: "Jun 2025",
                  author: "Weekend floater",
                },
                {
                  text: "Beautiful gravel bar 200 yards downstream. Perfect for lunch stop.",
                  date: "Jul 2025",
                  author: "First-timer",
                },
              ].map((n, i) => (
                <div
                  key={i}
                  style={{
                    padding: "10px",
                    background: "#faf8f5",
                    borderRadius: "8px",
                    borderLeft: "3px solid #d4c9b8",
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: "13px",
                      color: "#3a3225",
                      lineHeight: "1.5",
                    }}
                  >
                    {n.text}
                  </div>
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: "11px",
                      color: "#a09888",
                      marginTop: "6px",
                    }}
                  >
                    {n.author} · {n.date}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* ── Nearby Access Points ── */}
        <div
          style={{
            marginTop: "12px",
            background: "#fffdf9",
            borderRadius: "16px",
            border: "1px solid #e8e4df",
            padding: "16px",
            boxShadow: "0 1px 3px rgba(44,36,22,0.04)",
          }}
        >
          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: "12px",
              fontWeight: 600,
              color: "#a09888",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "10px",
            }}
          >
            Nearby on Huzzah Creek
          </div>
          {[
            {
              name: "Huzzah Conservation Access",
              dir: "Upstream",
              dist: "3.2 mi",
              time: "~1.5 hr float",
            },
            {
              name: "Scotts Ford",
              dir: "Downstream",
              dist: "4.8 mi",
              time: "~2.5 hr float",
            },
          ].map((ap, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 0",
                borderTop: i > 0 ? "1px solid #e8e4df" : "none",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: i === 0 ? "#e8f0e3" : "#f0ebe3",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "14px",
                  marginRight: "10px",
                }}
              >
                {i === 0 ? "↑" : "↓"}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#2c2416",
                  }}
                >
                  {ap.name}
                </div>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "11px",
                    color: "#a09888",
                  }}
                >
                  {ap.dir} · {ap.dist} · {ap.time}
                </div>
              </div>
              <span style={{ color: "#a09888", fontSize: "14px" }}>›</span>
            </div>
          ))}
        </div>

        {/* ── Design Notes (for spec purposes) ── */}
        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            background: "#2c2416",
            borderRadius: "12px",
            fontFamily: "'DM Mono', monospace",
            fontSize: "11px",
            color: "#a09888",
            lineHeight: "1.8",
          }}
        >
          <div
            style={{
              color: "#d4c9b8",
              fontWeight: 600,
              fontSize: "12px",
              marginBottom: "8px",
            }}
          >
            📐 Spec Notes
          </div>
          <div>
            <strong style={{ color: "#e8e4df" }}>Max-width:</strong> 520px (mobile-first, centers on desktop)
          </div>
          <div>
            <strong style={{ color: "#e8e4df" }}>Sections:</strong> Collapsible accordion — first section open by default
          </div>
          <div>
            <strong style={{ color: "#e8e4df" }}>Nav buttons:</strong> Deep-link to Onx/Gaia/Google/Apple with lat/lng params
          </div>
          <div>
            <strong style={{ color: "#e8e4df" }}>Gauge:</strong> Always visible (not collapsible) — it's the reason people visit
          </div>
          <div>
            <strong style={{ color: "#e8e4df" }}>Desktop:</strong> Same card layout, wider breathing room via container max-width
          </div>
          <div>
            <strong style={{ color: "#e8e4df" }}>Facilities links:</strong> Deep-link to specific MDC/NPS/USFS page, not homepage
          </div>
          <div>
            <strong style={{ color: "#e8e4df" }}>Eddy tips:</strong> 🦦 Otter icon for local knowledge callouts
          </div>
        </div>
      </div>
    </div>
  );
}
