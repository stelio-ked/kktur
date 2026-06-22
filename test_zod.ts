import { z } from 'zod';

const checks = [
  { name: 'regex', schema: z.string().regex(/abc/), val: 'x' },
  { name: 'uuid', schema: z.string().uuid(), val: 'x' },
  { name: 'cuid', schema: z.string().cuid(), val: 'x' },
  { name: 'datetime', schema: z.string().datetime(), val: 'x' },
];

for (const {name, schema, val} of checks) {
  const result = schema.safeParse(val);
  if (!result.success) {
    console.log(`${name}: ${result.error.issues[0].message}`);
  }
}
