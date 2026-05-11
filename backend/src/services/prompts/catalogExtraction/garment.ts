export const GARMENT_APPENDIX = `
CATEGORY: GARMENTS / APPAREL / FABRIC
- Default baseUnit: "piece" for stitched garments, "metre" for fabric by the yard.
- Size charts (S/M/L/XL) are variants — flatten by emitting one product per size ONLY if each size has a distinct price. Otherwise, one product with size list in description.
- Color variants: list unique colors in description, not as separate products, unless prices differ.
- Common confusions: "₹999 onwards" / "starting at" — leave basePrice null with confidence 0.4.
- SKU may be the style code printed on the tag ("KUR-0042", "SAR-110"). Preserve case.
`;
