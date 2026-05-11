# Vendor Mobile App

Vendor mobile application for ChatLogix platform built with React Native and Expo.

## Tech Stack

- React Native
- Expo ~50.0.0
- TypeScript
- NativeWind (Tailwind for React Native)
- React Navigation
- TanStack Query
- Zustand
- React Hook Form + Zod

## Prerequisites

- Node.js >= 18.0.0
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (for Mac) or Android Studio (for Android development)

## Development

```bash
# Start Expo development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run on web
npm run web
```

## Environment Variables

Create `.env` file in the app root:

- `EXPO_PUBLIC_API_URL` - Backend API URL
- `EXPO_PUBLIC_ENVIRONMENT` - Environment (development/staging/production)

Access via `expo-constants`:

```ts
import Constants from 'expo-constants';
const apiUrl = Constants.expoConfig?.extra?.apiUrl;
```

## Building

### Development Build

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for development
eas build --profile development --platform ios
eas build --profile development --platform android
```

### Production Build

```bash
# Build for production
eas build --profile production --platform all

# Submit to app stores
eas submit --platform all
```

## Project Structure

```
src/
├── screens/          # Screen components
├── components/       # Reusable components
├── navigation/       # Navigation configuration
├── hooks/           # Custom hooks
├── stores/          # Zustand stores
└── utils/           # Utility functions
```

