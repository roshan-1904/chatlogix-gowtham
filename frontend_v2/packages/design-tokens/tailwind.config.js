const { colors, spacing, typography, borderRadius, breakpoints } = require('./dist/index.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [],
  theme: {
    extend: {
      colors: colors,
      spacing: spacing,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
      fontWeight: typography.fontWeight,
      borderRadius: borderRadius,
      screens: breakpoints,
    },
  },
  plugins: [],
};

