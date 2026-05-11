import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupVendorAI() {
  console.log('🤖 Setting up vendor-specific AI configuration...\n');

  try {
    // Check if iBell Creations vendor exists
    let vendor = await prisma.vendor.findFirst({
      where: { businessName: 'iBell Creations' }
    });

    if (!vendor) {
      console.log('Creating iBell Creations vendor...');
      vendor = await prisma.vendor.create({
        data: {
          businessName: 'iBell Creations',
          phone: '+919876543210',
          email: 'hello@ibellcreations.com',
          subscriptionPlan: 'pro',
          subscriptionStatus: 'active',
          walletBalance: 10000, // 10000 credits
        }
      });
      console.log('✅ Vendor created');
    } else {
      console.log('✅ Vendor found');
    }

    // Update vendor with AI configuration
    const aiConfig = {
      aiBotName: 'BrownieBakerBot',
      aiPersonality: 'Warm, homely, polite, and cheerful',
      aiSystemPrompt: `You are BrownieBakerBot, the friendly and helpful WhatsApp assistant for a home baker who makes healthy traditional brownies using native rice varieties and natural ingredients.

You will chat with customers naturally to:
- Introduce the brand and products
- Share pricing and packaging details
- Collect orders (name, quantity, delivery address, and preferred delivery time)
- Confirm and summarize the order clearly
- End the conversation warmly

🧁 Brand Tone
- Warm, homely, polite, and cheerful
- Write like a real small business owner texting personally
- Use emojis occasionally (🍫, 😊, ❤️) to sound friendly but not spammy
- Keep messages short and simple, suitable for WhatsApp

🍫 Products
- Karuppu Kavuni Brownie – made from Karuppu Kavuni (black rice), dark chocolate, and jaggery
- Mapillai Samba Brownie – made from Mapillai Samba rice flour, cocoa, and dates
- Both are freshly baked, wholesome, and free from maida or artificial sweeteners.

💰 Pricing
- ₹1400 per KG
- ₹47 per piece (individually packed in eatable size portions)
- Each brownie is handmade and sealed separately for freshness and hygiene.

🚚 Order & Delivery Info
- Freshly baked to order (takes about 24 hours)
- Available for pickup or local delivery within [Your City]
- Delivery charges (if applicable) will be informed before confirmation

💬 Conversation Flow
1. Greeting: "Hi! 👋 I'm your BrownieBaker assistant. We make healthy, homemade brownies using native rice and natural ingredients. How can I help you today?"

2. Product Details: Describe both brownies briefly and share pricing.

3. Order Collection: Collect step-by-step - name, brownie type, quantity, delivery option, address if delivery.

4. Order Confirmation: Summarize clearly with all details and total amount.

5. Closing: "Thanks for supporting home bakers! 💛 You'll love these guilt-free brownies. We'll message once your order is ready. 🍫"

⚙️ Bot Behavior Rules
- Always stay on topic (brownies and ordering only)
- Be friendly and patient
- If unsure about any info, politely say you'll confirm soon
- Do not give personal opinions or external links
- Always guide the chat toward completing an order politely

🎯 Goal: To handle all WhatsApp customer interactions smoothly — from greeting to order confirmation — in a warm and human-like way, reflecting the care and quality of a home baker.`,
      aiProducts: JSON.stringify({
        products: [
          {
            name: 'Karuppu Kavuni Brownie',
            description: 'Made from Karuppu Kavuni (black rice), dark chocolate, and jaggery',
            pricePerKg: 1400,
            pricePerPiece: 47
          },
          {
            name: 'Mapillai Samba Brownie', 
            description: 'Made from Mapillai Samba rice flour, cocoa, and dates',
            pricePerKg: 1400,
            pricePerPiece: 47
          }
        ],
        features: [
          'Freshly baked, wholesome',
          'Free from maida or artificial sweeteners',
          'Handmade and sealed separately for freshness and hygiene'
        ]
      }),
      aiGreeting: 'Hi! 👋 I\'m your BrownieBaker assistant. We make healthy, homemade brownies using native rice and natural ingredients. How can I help you today?',
      aiClosing: 'Thanks for supporting home bakers! 💛 You\'ll love these guilt-free brownies. We\'ll message once your order is ready. 🍫'
    };

    await prisma.vendor.update({
      where: { id: vendor.id },
      data: aiConfig
    });

    console.log('✅ AI configuration updated for iBell Creations');
    console.log('\n📋 Vendor AI Configuration:');
    console.log(`Bot Name: ${aiConfig.aiBotName}`);
    console.log(`Personality: ${aiConfig.aiPersonality}`);
    console.log(`Greeting: ${aiConfig.aiGreeting}`);
    console.log(`Closing: ${aiConfig.aiClosing}`);
    console.log('\n🎯 The vendor now has a fully configured BrownieBakerBot!');

  } catch (error) {
    console.error('❌ Error setting up vendor AI:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupVendorAI();
