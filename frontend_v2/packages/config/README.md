# @chatlogix/config

Shared configuration package for ChatLogix applications.

## Features

- Environment variable validation
- API endpoints
- Feature flags

## Usage

```ts
import { validateEnv, apiEndpoints } from '@chatlogix/config';

const env = validateEnv(process.env);
const productsUrl = apiEndpoints.products.list;
```

