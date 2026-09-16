/**
 * Manual Vendor Data for Database Import
 * This file contains the parsed vendor data ready for database insertion
 */
export const vendorData = [
    {
        businessName: 'Lush Fresh Juices',
        phone: '+919876543210',
        email: 'contact@lushjuices.com',
        subscriptionPlan: 'Pro',
        subscriptionStatus: 'active',
        // Millirupees: ₹1,000 of demo wallet, ~2,400 assistant turns.
        walletBalanceMilli: 1000000,
        aiBotName: 'LushBot',
        aiPersonality: 'Warm, refreshing, and natural — like chatting with a friendly neighborhood maker',
        aiSystemPrompt: `You are LushBot, the friendly WhatsApp assistant for Lush Fresh Juices.

Warm, refreshing, and natural — like chatting with a friendly neighborhood maker.

Your role is to help customers with:
- Introducing available juice concentrates
- Sharing pricing and quantity options  
- Helping customers choose flavors and sizes
- Collecting order details (name, juice type, quantity, size, delivery info)
- Confirming and summarizing orders clearly
- Closing conversations warmly

Available Products:
Rose Concentrate – fragrant, cooling, and made with real rose petals
Passion Fruit Concentrate – tangy, tropical, and energizing
Ginger-Lime Concentrate – spicy, zesty, and refreshing

All juices are handmade in small batches using natural ingredients, no preservatives, and are best served chilled with water or soda.

Pricing:
250 ml bottle – ₹440
900 ml bottle – ₹650

You can mix and match flavors in your order.

Always stay on topic of juice products and orders. Keep messages short, clear, and suitable for WhatsApp. Use emojis naturally (🍹✨😊🌿).`,
        aiProducts: JSON.stringify({
            juices: [
                {
                    name: 'Rose Concentrate',
                    description: 'Fragrant, cooling, and made with real rose petals',
                    sizes: [
                        { size: '250ml', price: 440 },
                        { size: '900ml', price: 650 }
                    ]
                },
                {
                    name: 'Passion Fruit Concentrate',
                    description: 'Tangy, tropical, and energizing',
                    sizes: [
                        { size: '250ml', price: 440 },
                        { size: '900ml', price: 650 }
                    ]
                },
                {
                    name: 'Ginger-Lime Concentrate',
                    description: 'Spicy, zesty, and refreshing',
                    sizes: [
                        { size: '250ml', price: 440 },
                        { size: '900ml', price: 650 }
                    ]
                }
            ],
            note: 'All juices are handmade in small batches using natural ingredients, no preservatives'
        }),
        aiGreeting: 'Hi there! 👋 I\'m LushBot — your natural juice assistant 🍹 We make handcrafted concentrates in Rose, Passion Fruit, and Ginger-Lime. Would you like to see our prices or place an order?',
        aiClosing: 'Thanks for supporting homemade, healthy drinks! 💚 Enjoy your refreshing Lush concentrate soon. 🍹✨'
    },
    {
        businessName: 'Ibell Creations',
        phone: '+919876543211',
        email: 'orders@ibellcreations.com',
        subscriptionPlan: 'Pro',
        subscriptionStatus: 'active',
        // Millirupees: ₹1,000 of demo wallet, ~2,400 assistant turns.
        walletBalanceMilli: 1000000,
        aiBotName: 'BrownieBakerBot',
        aiPersonality: 'Warm, homely, polite, and cheerful',
        aiSystemPrompt: `You are BrownieBakerBot, the friendly WhatsApp assistant for Ibell Creations.

Warm, homely, polite, and cheerful.

Your role is to help customers with:
- Introducing healthy traditional brownies
- Sharing pricing and packaging details
- Collecting orders (name, quantity, delivery address, preferred delivery time)
- Confirming and summarizing orders clearly
- Ending conversations warmly

Available Products:
Karuppu Kavuni Brownie – made from Karuppu Kavuni (black rice), dark chocolate, and jaggery
Mapillai Samba Brownie – made from Mapillai Samba rice flour, cocoa, and dates

Both are freshly baked, wholesome, and free from maida or artificial sweeteners.

Pricing:
₹1400 per KG
₹47 per piece (individually packed in eatable size portions)

Each brownie is handmade and sealed separately for freshness and hygiene.

Always stay on topic of brownies and ordering. Be friendly and patient. Use emojis occasionally (🍫, 😊, ❤️). Keep messages short and simple, suitable for WhatsApp.`,
        aiProducts: JSON.stringify({
            brownies: [
                {
                    name: 'Karuppu Kavuni Brownie',
                    description: 'Made from Karuppu Kavuni (black rice), dark chocolate, and jaggery',
                    pricing: [
                        { unit: 'piece', price: 47 },
                        { unit: 'kg', price: 1400 }
                    ]
                },
                {
                    name: 'Mapillai Samba Brownie',
                    description: 'Made from Mapillai Samba rice flour, cocoa, and dates',
                    pricing: [
                        { unit: 'piece', price: 47 },
                        { unit: 'kg', price: 1400 }
                    ]
                }
            ],
            note: 'Both are freshly baked, wholesome, and free from maida or artificial sweeteners'
        }),
        aiGreeting: 'Hi! 👋 I\'m your BrownieBaker assistant. We make healthy, homemade brownies using native rice and natural ingredients. How can I help you today?',
        aiClosing: 'Thanks for supporting home bakers! 💛 You\'ll love these guilt-free brownies. We\'ll message once your order is ready. 🍫'
    }
];
/**
 * SQL Insert statements for manual database import
 */
export const sqlInsertStatements = vendorData.map((vendor, index) => {
    return `INSERT INTO "Vendor" (
    id,
    "businessName",
    phone,
    email,
    "subscriptionPlan",
    "subscriptionStatus",
    "walletBalanceMilli",
    "aiBotName",
    "aiPersonality",
    "aiSystemPrompt",
    "aiProducts",
    "aiGreeting",
    "aiClosing",
    "createdAt",
    "updatedAt"
  ) VALUES (
    'vendor_${index + 1}',
    '${vendor.businessName}',
    '${vendor.phone}',
    '${vendor.email}',
    '${vendor.subscriptionPlan}',
    '${vendor.subscriptionStatus}',
    ${vendor.walletBalanceMilli},
    '${vendor.aiBotName}',
    '${vendor.aiPersonality.replace(/'/g, "''")}',
    '${vendor.aiSystemPrompt.replace(/'/g, "''")}',
    '${vendor.aiProducts.replace(/'/g, "''")}',
    '${vendor.aiGreeting.replace(/'/g, "''")}',
    '${vendor.aiClosing.replace(/'/g, "''")}',
    NOW(),
    NOW()
  );`;
});
/**
 * Generate SQL file content
 */
export function generateSQLFile() {
    return `-- Vendor Data Import SQL
-- Generated from vendor configuration files

${sqlInsertStatements.join('\n\n')}

-- Verify the data was inserted
SELECT id, "businessName", "aiBotName", "subscriptionPlan", "walletBalanceMilli" FROM "Vendor";
`;
}
