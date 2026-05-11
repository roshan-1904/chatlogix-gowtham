export const RESTAURANT_APPENDIX = `
CATEGORY: RESTAURANT / FOOD MENU
- Default baseUnit: "plate" for main dishes, "piece" for snacks/rolls, "glass" for beverages.
- "Half / Full" portions are NOT variants — emit as two separate products: "Chicken Biryani (Half)" and "Chicken Biryani (Full)".
- Ignore taxes, service charges, and "Prices inclusive of GST" footers.
- Combo meals / thalis: emit as one product; describe contents in description.
- Common confusions: "250 ml" on a beverage is baseQuantity, not price. "30/-" means ₹30.
`;
