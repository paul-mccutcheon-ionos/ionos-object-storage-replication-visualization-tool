// Inline SVG flags. Emoji flags (🇩🇪 etc.) render as blank/plain glyphs on
// Windows - there's no system font with flag graphics - so real vector
// flags are drawn here instead of relying on emoji font support.

function GermanyFlag() {
  return (
    <svg viewBox="0 0 5 3" preserveAspectRatio="xMidYMid slice">
      <rect width="5" height="3" fill="#000" />
      <rect width="5" height="2" y="1" fill="#D00" />
      <rect width="5" height="1" y="2" fill="#FFCE00" />
    </svg>
  );
}

function SpainFlag() {
  return (
    <svg viewBox="0 0 5 3" preserveAspectRatio="xMidYMid slice">
      <rect width="5" height="3" fill="#AA151B" />
      <rect width="5" height="1.5" y="0.75" fill="#F1BF00" />
    </svg>
  );
}

function UsaFlag() {
  return (
    <svg viewBox="0 0 19 10" preserveAspectRatio="xMidYMid slice">
      <rect width="19" height="10" fill="#B22234" />
      {[1, 3, 5, 7, 9].map((y) => (
        <rect key={y} width="19" height="0.77" y={y} fill="#fff" />
      ))}
      <rect width="8" height="5.38" fill="#3C3B6E" />
    </svg>
  );
}

export const FLAGS = {
  DE: GermanyFlag,
  ES: SpainFlag,
  US: UsaFlag,
};
