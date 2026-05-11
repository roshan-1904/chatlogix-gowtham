import { prisma } from '../src/db/prisma.js';
async function main() {
    const targetId = process.argv[2] || 'vendor_ibell_001';
    const byId = await prisma.vendor.findUnique({ where: { id: targetId } });
    const vendor = byId || await prisma.vendor.findFirst({ where: { businessName: 'Ibell Creations' } });
    if (!vendor) {
        console.error('Vendor not found by id or businessName.');
        process.exit(1);
    }
    const aiBotName = 'BrownieBakerBot';
    const aiPersonality = 'Warm, homely, polite, cheerful; concise, WhatsApp-friendly with natural emojis.';
    const vendorPrompt = `# Brand Voice
- Warm, homely, polite, cheerful; keep responses short and WhatsApp-friendly.
- Use emojis naturally (🍫😊❤️). Never invent details.

# Product Overview
- Karuppu Kavuni Brownie — black rice, dark chocolate, jaggery.
- Mapillai Samba Brownie — samba rice flour, cocoa, dates.
- Freshly baked, wholesome, free from maida/artificial sweeteners; individually packed.

# Pricing
- ₹1400 per kg
- ₹47 per piece (individually packed)
- Toppings: ₹100 per kg; customizations confirmed at finalization.

# Delivery
- Coimbatore city: Porter (quick). Outside/far: Delhivery (2–5 days).
- Inform ETA when confirming the order.

# Collection Checklist
- Customer name; product; quantity (kg / pieces);
- Delivery address; preferred delivery time.

# Closing Style
- Examples: "Thank you so much 😊 Your brownies will be freshly packed with love ❤️"`;
    const aiProducts = {
        brownies: [
            {
                name: 'Karuppu Kavuni Brownie',
                description: 'Made from Karuppu Kavuni (black rice), dark chocolate, and jaggery',
                pricing: [{ unit: 'piece', price: 47 }, { unit: 'kg', price: 1400 }]
            },
            {
                name: 'Mapillai Samba Brownie',
                description: 'Made from Mapillai Samba rice flour, cocoa, and dates',
                pricing: [{ unit: 'piece', price: 47 }, { unit: 'kg', price: 1400 }]
            }
        ],
        note: 'Both are freshly baked, wholesome, and free from maida or artificial sweeteners'
    };
    const aiGreeting = 'Hi 😊 I’m BrownieBakerBot from Ibell Creations! We make healthy traditional brownies using Karuppu Kavuni and Mapillai Samba rice 🍫 Would you like to know today’s batch or place an order?';
    const aiClosing = 'Thank you so much 😊 Your brownies will be freshly packed with love ❤️';
    const updated = await prisma.vendor.update({
        where: { id: vendor.id },
        data: {
            aiBotName,
            aiPersonality,
            aiSystemPrompt: vendorPrompt,
            aiProducts: JSON.stringify(aiProducts),
            aiGreeting,
            aiClosing,
        }
    });
    console.log('Updated vendor AI configuration:', { id: updated.id, businessName: updated.businessName });
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
}).finally(async () => {
    await prisma.$disconnect();
});
