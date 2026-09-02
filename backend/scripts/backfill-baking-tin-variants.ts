// One-off: populate real size/material variants for Ibell Creations' baking
// tin (previously null, priced only at a single basePrice), and cancel the
// pending order that got created with a hallucinated "4x6" size at the wrong
// price — the bug this backfill + the conversation/ pipeline changes fix.
import { prisma } from '../src/db/prisma.js';
import { invalidateCompactCatalog } from '../src/conversation/prefetch.js';

const PRODUCT_ID = 'bf2432ed-18b1-42ac-a5e0-9e7ac538dd8f';
const VENDOR_ID = 'vendor_ibell_001';
const BAD_ORDER_ID = 'dc662ff1-9638-4b08-8484-ffe3340fb8fc'; // ORD-ORDER-2026090001

// Real prices from the product's own description table.
const SIZES: Array<{ size: string; kadaiPaise: number; ssPaise: number }> = [
  { size: '7x7', kadaiPaise: 129900, ssPaise: 179900 },
  { size: '8x8', kadaiPaise: 129900, ssPaise: 179900 },
  { size: '9x9', kadaiPaise: 160000, ssPaise: 210000 },
  { size: '10x10', kadaiPaise: 175000, ssPaise: 225000 },
  { size: '10x12', kadaiPaise: 195000, ssPaise: 245000 }
];

function variantsFor(sizes: typeof SIZES) {
  return sizes.flatMap(({ size, kadaiPaise, ssPaise }) => [
    {
      sku: `KD-${size.toUpperCase()}`,
      label: `Kadai ${size}`,
      attributes: { size, material: 'Kadai' },
      unit: 'unit',
      baseQuantity: 1,
      price: kadaiPaise,
      isDivisible: false,
      isActive: true
    },
    {
      sku: `SS-${size.toUpperCase()}`,
      label: `SS ${size}`,
      attributes: { size, material: 'Stainless Steel' },
      unit: 'unit',
      baseQuantity: 1,
      price: ssPaise,
      isDivisible: false,
      isActive: true
    }
  ]);
}

async function main() {
  const variants = variantsFor(SIZES);

  await prisma.product.update({
    where: { id: PRODUCT_ID },
    data: { variants }
  });
  console.log(`Set ${variants.length} variants on product ${PRODUCT_ID}`);

  const order = await prisma.order.findUnique({ where: { id: BAD_ORDER_ID } });
  if (order && order.status === 'pending') {
    await prisma.order.update({
      where: { id: BAD_ORDER_ID },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: 'Invalid size (4x6 does not exist on this product); created before variant-aware pricing fix'
      }
    });
    console.log(`Cancelled order ${BAD_ORDER_ID}`);
  } else {
    console.log(`Order ${BAD_ORDER_ID} not found or no longer pending (status=${order?.status ?? 'n/a'}) — left untouched`);
  }

  await invalidateCompactCatalog(VENDOR_ID);
  console.log(`Invalidated compact catalog cache for vendor ${VENDOR_ID}`);
}

main()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
