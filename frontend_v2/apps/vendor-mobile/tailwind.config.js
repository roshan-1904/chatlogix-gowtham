const designTokens = require('@chatlogix/design-tokens/nativewind');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    ...designTokens.theme,
  },
  plugins: [],
};

