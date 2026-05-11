# @chatlogix/auth

Authentication package for ChatLogix applications. Provides phone/OTP authentication flow, auth context, and token management.

## Features

- Phone/OTP authentication
- Token storage (localStorage for web, SecureStore for mobile)
- Auth context/provider
- Refresh token mechanism

## Usage

```tsx
import { AuthProvider, useAuth } from '@chatlogix/auth';
```

