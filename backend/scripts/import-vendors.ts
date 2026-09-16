import { prisma } from '../src/db/prisma.js';
import { logger } from '../src/logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Vendor Data Import Script
 * Parses vendor configuration files and imports them into the database
 */

interface VendorData {
  businessName: string;
  aiBotName: string;
  aiPersonality: string;
  aiSystemPrompt: string;
  aiProducts: string;
  aiGreeting: string;
  aiClosing: string;
  phone: string;
  email: string;
  subscriptionPlan: string;
  /** Wallet money is millirupees (1 rupee = 1000 milli). */
  walletBalanceMilli: number;
}

class VendorImporter {
  private vendorsDir: string;

  constructor() {
    this.vendorsDir = join(process.cwd(), 'requirements', 'vendors');
  }

  async importAllVendors(): Promise<void> {
    console.log('🚀 Starting vendor data import...');
    
    try {
      // Get all vendor files
      const vendorFiles = await this.getVendorFiles();
      console.log(`Found ${vendorFiles.length} vendor files: ${vendorFiles.join(', ')}`);

      let imported = 0;
      let errors = 0;

      for (const fileName of vendorFiles) {
        try {
          console.log(`\n📄 Processing vendor: ${fileName}`);
          
          const vendorData = await this.parseVendorFile(fileName);
          await this.importVendor(vendorData);
          
          imported++;
          console.log(`✅ Successfully imported: ${vendorData.businessName}`);
        } catch (error) {
          errors++;
          console.error(`❌ Error importing ${fileName}:`, error);
          logger.error('Vendor import error', { fileName, error });
        }
      }

      console.log(`\n🎉 Import completed!`);
      console.log(`✅ Successfully imported: ${imported} vendors`);
      console.log(`❌ Errors: ${errors} vendors`);
      
    } catch (error) {
      console.error('💥 Import failed:', error);
      logger.error('Vendor import failed', { error });
      throw error;
    }
  }

  private async getVendorFiles(): Promise<string[]> {
    // For now, return the known vendor files
    // In a real implementation, you'd read the directory
    return ['lush', 'ibell creations'];
  }

  private async parseVendorFile(fileName: string): Promise<VendorData> {
    const filePath = join(this.vendorsDir, fileName);
    const content = readFileSync(filePath, 'utf-8');

    if (fileName === 'lush') {
      return this.parseLushVendor(content);
    } else if (fileName === 'ibell creations') {
      return this.parseIbellVendor(content);
    } else {
      throw new Error(`Unknown vendor file: ${fileName}`);
    }
  }

  private parseLushVendor(content: string): VendorData {
    // Extract business name from the content
    const businessName = 'Lush Fresh Juices';
    
    // Extract bot name
    const botNameMatch = content.match(/You are (\w+),/);
    const aiBotName = botNameMatch ? botNameMatch[1] : 'LushBot';

    // Extract personality from brand tone section
    const personalityMatch = content.match(/🧃 Brand Tone\s*\n\s*(.*?)(?=\n\s*🍓|$)/s);
    const aiPersonality = personalityMatch ? personalityMatch[1].trim() : 'Warm, refreshing, and natural';

    // Extract products and pricing
    const productsMatch = content.match(/🍓 Available Juices\s*\n\s*(.*?)(?=\n\s*💰|$)/s);
    const pricingMatch = content.match(/💰 Pricing\s*\n\s*(.*?)(?=\n\s*🚚|$)/s);
    
    const aiProducts = JSON.stringify({
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
    });


    // Extract greeting
    const greetingMatch = content.match(/1\. Greeting:\s*\n\s*"(.*?)"/);
    const aiGreeting = greetingMatch ? greetingMatch[1] : 'Hi there! 👋 I\'m LushBot — your natural juice assistant 🍹';

    // Extract closing
    const closingMatch = content.match(/5\. Closing message:\s*\n\s*"(.*?)"/);
    const aiClosing = closingMatch ? closingMatch[1] : 'Thanks for supporting homemade, healthy drinks! 💚';

    // Create system prompt
    const aiSystemPrompt = `You are ${aiBotName}, the friendly WhatsApp assistant for ${businessName}.

${aiPersonality}

Your role is to help customers with:
- Introducing available juice concentrates
- Sharing pricing and quantity options  
- Helping customers choose flavors and sizes
- Collecting order details (name, juice type, quantity, size, delivery info)
- Confirming and summarizing orders clearly
- Closing conversations warmly

Available Products:
${productsMatch ? productsMatch[1].trim() : 'Rose, Passion Fruit, and Ginger-Lime concentrates'}

Pricing:
${pricingMatch ? pricingMatch[1].trim() : '250ml bottle – ₹440, 900ml bottle – ₹650'}

Always stay on topic of juice products and orders. Keep messages short, clear, and suitable for WhatsApp. Use emojis naturally (🍹✨😊🌿).`;

    return {
      businessName,
      aiBotName,
      aiPersonality,
      aiSystemPrompt,
      aiProducts,
      aiGreeting,
      aiClosing,
      phone: '+919876543210', // Default phone
      email: 'contact@lushjuices.com', // Default email
      subscriptionPlan: 'Pro',
      walletBalanceMilli: 1_000_000 // ₹1,000
    };
  }

  private parseIbellVendor(content: string): VendorData {
    // Extract business name
    const businessName = 'Ibell Creations';
    
    // Extract bot name
    const botNameMatch = content.match(/You are (\w+),/);
    const aiBotName = botNameMatch ? botNameMatch[1] : 'BrownieBakerBot';

    // Extract personality from brand tone section
    const personalityMatch = content.match(/🧁 Brand Tone\s*\n\s*(.*?)(?=\n\s*🍫|$)/s);
    const aiPersonality = personalityMatch ? personalityMatch[1].trim() : 'Warm, homely, polite, and cheerful';

    // Extract products and pricing
    const productsMatch = content.match(/🍫 Products\s*\n\s*(.*?)(?=\n\s*💰|$)/s);
    const pricingMatch = content.match(/💰 Pricing\s*\n\s*(.*?)(?=\n\s*🚚|$)/s);
    
    const aiProducts = JSON.stringify({
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
    });


    // Extract greeting
    const greetingMatch = content.match(/1\. Greeting\s*\n\s*"(.*?)"/);
    const aiGreeting = greetingMatch ? greetingMatch[1] : 'Hi! 👋 I\'m your BrownieBaker assistant. We make healthy, homemade brownies using native rice and natural ingredients.';

    // Extract closing
    const closingMatch = content.match(/5\. Closing Message\s*\n\s*"(.*?)"/);
    const aiClosing = closingMatch ? closingMatch[1] : 'Thanks for supporting home bakers! 💛 You\'ll love these guilt-free brownies.';

    // Create system prompt
    const aiSystemPrompt = `You are ${aiBotName}, the friendly WhatsApp assistant for ${businessName}.

${aiPersonality}

Your role is to help customers with:
- Introducing healthy traditional brownies
- Sharing pricing and packaging details
- Collecting orders (name, quantity, delivery address, preferred delivery time)
- Confirming and summarizing orders clearly
- Ending conversations warmly

Available Products:
${productsMatch ? productsMatch[1].trim() : 'Karuppu Kavuni Brownie and Mapillai Samba Brownie'}

Pricing:
${pricingMatch ? pricingMatch[1].trim() : '₹1400 per KG, ₹47 per piece'}

Always stay on topic of brownies and ordering. Be friendly and patient. Use emojis occasionally (🍫, 😊, ❤️). Keep messages short and simple, suitable for WhatsApp.`;

    return {
      businessName,
      aiBotName,
      aiPersonality,
      aiSystemPrompt,
      aiProducts,
      aiGreeting,
      aiClosing,
      phone: '+919876543211', // Default phone
      email: 'orders@ibellcreations.com', // Default email
      subscriptionPlan: 'Pro',
      walletBalanceMilli: 1_000_000 // ₹1,000
    };
  }

  private async importVendor(vendorData: VendorData): Promise<void> {
    try {
      // Check if vendor already exists
      const existingVendor = await prisma.vendor.findFirst({
        where: {
          OR: [
            { businessName: vendorData.businessName },
            { email: vendorData.email }
          ]
        }
      });

      if (existingVendor) {
        console.log(`  ⏭️  Vendor ${vendorData.businessName} already exists, skipping...`);
        return;
      }

      // Create new vendor
      const vendor = await prisma.vendor.create({
        data: {
          businessName: vendorData.businessName,
          phone: vendorData.phone,
          email: vendorData.email,
          subscriptionPlan: vendorData.subscriptionPlan,
          subscriptionStatus: 'active',
          walletBalanceMilli: vendorData.walletBalanceMilli,
          aiBotName: vendorData.aiBotName,
          aiPersonality: vendorData.aiPersonality,
          aiSystemPrompt: vendorData.aiSystemPrompt,
          aiProducts: vendorData.aiProducts,
          aiGreeting: vendorData.aiGreeting,
          aiClosing: vendorData.aiClosing
        }
      });

      console.log(`  💾 Vendor created with ID: ${vendor.id}`);
      logger.info('Vendor imported successfully', { 
        vendorId: vendor.id, 
        businessName: vendorData.businessName 
      });

    } catch (error) {
      logger.error('Error importing vendor', { error, vendorData });
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    await prisma.$disconnect();
  }
}

// Run import if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const importer = new VendorImporter();
  
  importer.importAllVendors()
    .then(() => {
      console.log('✅ Vendor import completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Vendor import failed:', error);
      process.exit(1);
    })
    .finally(() => {
      importer.cleanup();
    });
}

export { VendorImporter };
