# @chatlogix/schemas

Zod validation schemas package for ChatLogix applications.

## Schemas

- Auth (login, register)
- Products
- Orders
- Templates

## Usage

```ts
import { loginSchema, productSchema } from '@chatlogix/schemas';

const result = loginSchema.parse({ phone: '+1234567890' });
```

