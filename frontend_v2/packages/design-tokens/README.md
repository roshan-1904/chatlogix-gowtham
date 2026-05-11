# @chatlogix/design-tokens

Design tokens package for ChatLogix applications. Provides consistent colors, spacing, typography, and other design system values.

## Usage

### Web (Tailwind)

```js
// tailwind.config.js
const designTokens = require('@chatlogix/design-tokens/tailwind');

module.exports = {
  ...designTokens,
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
};
```

### Mobile (NativeWind)

```js
// tailwind.config.js
const designTokens = require('@chatlogix/design-tokens/nativewind');

module.exports = {
  ...designTokens,
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
};
```

### TypeScript

```ts
import { colors, spacing, typography } from '@chatlogix/design-tokens';
```

