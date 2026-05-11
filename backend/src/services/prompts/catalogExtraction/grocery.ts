export const GROCERY_APPENDIX = `
CATEGORY: GROCERY / KIRANA
- Default baseUnit: "kg" for loose commodities (rice, dal, flour, sugar), "piece" for packaged items (biscuits, soaps), "litre" for oil.
- Pack sizes printed alongside brand: "Aashirvaad Atta 5kg" → baseUnit:"kg", baseQuantity:5, name:"Aashirvaad Atta".
- Distinguish rate lists (price per kg) from pack lists (price per packet). Look for "/kg", "per kg", "Rs/kg" suffixes.
- Brand names are part of the product name, not keywords.
- Common confusions: "BP" = "Best Price". "MRP" applies only when explicitly printed.
`;
