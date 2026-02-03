import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, spring, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../lib/constants";

/**
 * Scene 6: Blog & Guides (29-34s)
 * Staggered blog post cards sliding in
 * Narration: "Plus in-depth river guides and blog posts..."
 */
export const BlogGuidesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fades
  const fadeIn = interpolate(frame, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [130, 150], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Blog cards
  const cards = [
    {
      title: "Best Float Rivers in Missouri: 2026 Guide",
      category: "Guide",
      readTime: "12 min read",
      delay: 20,
    },
    {
      title: "Planning Your First Missouri Float Trip",
      category: "Tips",
      readTime: "8 min read",
      delay: 35,
    },
    {
      title: "Current River: Akers to Pulltite",
      category: "Trip Report",
      readTime: "6 min read",
      delay: 50,
    },
  ];

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      {/* Background */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `linear-gradient(135deg, ${COLORS.forestGreen} 0%, ${COLORS.deepWater} 100%)`,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 80,
        }}
      >
        {/* Header */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 50,
            opacity: interpolate(frame, [10, 30], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <h2
            style={{
              color: COLORS.white,
              fontSize: 56,
              fontFamily: FONTS.heading,
              fontWeight: 700,
              margin: 0,
            }}
          >
            River Guides & Blog
          </h2>
          <p
            style={{
              color: COLORS.mossGreen,
              fontSize: 24,
              fontFamily: FONTS.body,
              marginTop: 12,
            }}
          >
            Everything you need to plan your perfect float
          </p>
        </div>

        {/* Cards grid */}
        <div
          style={{
            display: "flex",
            gap: 30,
            justifyContent: "center",
          }}
        >
          {cards.map((card, i) => {
            const slideIn = spring({
              frame: frame - card.delay,
              fps,
              config: { damping: 15, mass: 0.8, stiffness: 100 },
            });
            const x = interpolate(slideIn, [0, 1], [100, 0]);
            const opacity = interpolate(slideIn, [0, 0.5, 1], [0, 0.8, 1]);

            return (
              <div
                key={i}
                style={{
                  width: 360,
                  backgroundColor: COLORS.offWhite,
                  borderRadius: 20,
                  padding: 30,
                  transform: `translateX(${x}px)`,
                  opacity,
                  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
                }}
              >
                {/* Category badge */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <span
                    style={{
                      backgroundColor: `${COLORS.riverBlue}20`,
                      color: COLORS.riverBlue,
                      fontSize: 14,
                      fontFamily: FONTS.body,
                      fontWeight: 600,
                      padding: "6px 14px",
                      borderRadius: 20,
                    }}
                  >
                    {card.category}
                  </span>
                  <span
                    style={{
                      color: COLORS.darkText + "80",
                      fontSize: 14,
                      fontFamily: FONTS.body,
                    }}
                  >
                    {card.readTime}
                  </span>
                </div>

                {/* Title */}
                <h3
                  style={{
                    color: COLORS.darkText,
                    fontSize: 24,
                    fontFamily: FONTS.heading,
                    fontWeight: 600,
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {card.title}
                </h3>

                {/* Read more link */}
                <div
                  style={{
                    marginTop: 20,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      color: COLORS.sunsetOrange,
                      fontSize: 16,
                      fontFamily: FONTS.body,
                      fontWeight: 600,
                    }}
                  >
                    Read more →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
