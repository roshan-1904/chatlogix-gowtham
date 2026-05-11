# @chatlogix/api-client

API client package for ChatLogix applications. Provides a typed API wrapper with automatic token injection and error handling.

## Usage

```ts
import { ApiClient } from '@chatlogix/api-client';

const apiClient = new ApiClient(
  'https://api.example.com',
  () => localStorage.getItem('token')
);

const data = await apiClient.get('/users');
```

