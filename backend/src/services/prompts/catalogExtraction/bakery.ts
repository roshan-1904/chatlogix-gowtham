export const BAKERY_APPENDIX = `
CATEGORY: BAKERY / CAKES / SWEETS
- Default baseUnit: "piece" for pastries/cupcakes, "kg" for cakes, "box" for multi-packs, "dozen" for cookies/cupcakes if printed that way.
- Cake pricing is often per kg; sizes like "1 kg", "1.5 kg", "2 kg" emit as separate products.
- Egg/Eggless or Vanilla/Chocolate are flavor variants — emit separate products with the flavor in the name.
- Custom orders, "24 hrs prior notice", "minimum order" notes → move to description, not name.
`;
