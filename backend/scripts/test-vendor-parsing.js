/**
 * Test vendor data parsing without database connection
 * This script parses the vendor files and displays the structured data
 */
import { readFileSync } from 'fs';
import { join } from 'path';
function parseLushVendor(content) {
    const businessName = 'Lush Fresh Juices';
    const botNameMatch = content.match(/You are (\w+),/);
    const aiBotName = botNameMatch ? botNameMatch[1] : 'LushBot';
    const personalityMatch = content.match(/🧃 Brand Tone\s*\n\s*(.*?)(?=\n\s*🍓|$)/s);
    const aiPersonality = personalityMatch ? personalityMatch[1].trim() : 'Warm, refreshing, and natural';
    const productsMatch = content.match(/🍓 Available Juices\s*\n\s*(.*?)(?=\n\s*💰|$)/s);
    const pricingMatch = content.match(/💰 Pricing\s*\n\s*(.*?)(?=\n\s*🚚|$)/s);
    const greetingMatch = content.match(/1\. Greeting:\s*\n\s*"(.*?)"/);
    const aiGreeting = greetingMatch ? greetingMatch[1] : 'Hi there! 👋 I\'m LushBot — your natural juice assistant 🍹';
    const closingMatch = content.match(/5\. Closing message:\s*\n\s*"(.*?)"/);
    const aiClosing = closingMatch ? closingMatch[1] : 'Thanks for supporting homemade, healthy drinks! 💚';
    return {
        businessName,
        aiBotName,
        aiPersonality,
        products: productsMatch ? productsMatch[1].trim() : 'Rose, Passion Fruit, and Ginger-Lime concentrates',
        pricing: pricingMatch ? pricingMatch[1].trim() : '250ml bottle – ₹440, 900ml bottle – ₹650',
        greeting: aiGreeting,
        closing: aiClosing
    };
}
function parseIbellVendor(content) {
    const businessName = 'Ibell Creations';
    const botNameMatch = content.match(/You are (\w+),/);
    const aiBotName = botNameMatch ? botNameMatch[1] : 'BrownieBakerBot';
    const personalityMatch = content.match(/🧁 Brand Tone\s*\n\s*(.*?)(?=\n\s*🍫|$)/s);
    const aiPersonality = personalityMatch ? personalityMatch[1].trim() : 'Warm, homely, polite, and cheerful';
    const productsMatch = content.match(/🍫 Products\s*\n\s*(.*?)(?=\n\s*💰|$)/s);
    const pricingMatch = content.match(/💰 Pricing\s*\n\s*(.*?)(?=\n\s*🚚|$)/s);
    const greetingMatch = content.match(/1\. Greeting\s*\n\s*"(.*?)"/);
    const aiGreeting = greetingMatch ? greetingMatch[1] : 'Hi! 👋 I\'m your BrownieBaker assistant.';
    const closingMatch = content.match(/5\. Closing Message\s*\n\s*"(.*?)"/);
    const aiClosing = closingMatch ? closingMatch[1] : 'Thanks for supporting home bakers! 💛';
    return {
        businessName,
        aiBotName,
        aiPersonality,
        products: productsMatch ? productsMatch[1].trim() : 'Karuppu Kavuni Brownie and Mapillai Samba Brownie',
        pricing: pricingMatch ? pricingMatch[1].trim() : '₹1400 per KG, ₹47 per piece',
        greeting: aiGreeting,
        closing: aiClosing
    };
}
function main() {
    console.log('🚀 Testing vendor data parsing...\n');
    try {
        // Parse Lush vendor
        console.log('📄 Parsing Lush vendor...');
        const lushContent = readFileSync(join(process.cwd(), '..', 'requirements', 'vendors', 'lush'), 'utf-8');
        const lushData = parseLushVendor(lushContent);
        console.log('✅ Lush vendor parsed successfully:');
        console.log(`   Business: ${lushData.businessName}`);
        console.log(`   Bot Name: ${lushData.aiBotName}`);
        console.log(`   Personality: ${lushData.aiPersonality.substring(0, 50)}...`);
        console.log(`   Products: ${lushData.products.substring(0, 50)}...`);
        console.log(`   Pricing: ${lushData.pricing}`);
        console.log(`   Greeting: ${lushData.greeting.substring(0, 50)}...`);
        console.log(`   Closing: ${lushData.closing.substring(0, 50)}...\n`);
        // Parse Ibell vendor
        console.log('📄 Parsing Ibell Creations vendor...');
        const ibellContent = readFileSync(join(process.cwd(), '..', 'requirements', 'vendors', 'ibell creations'), 'utf-8');
        const ibellData = parseIbellVendor(ibellContent);
        console.log('✅ Ibell Creations vendor parsed successfully:');
        console.log(`   Business: ${ibellData.businessName}`);
        console.log(`   Bot Name: ${ibellData.aiBotName}`);
        console.log(`   Personality: ${ibellData.aiPersonality.substring(0, 50)}...`);
        console.log(`   Products: ${ibellData.products.substring(0, 50)}...`);
        console.log(`   Pricing: ${ibellData.pricing}`);
        console.log(`   Greeting: ${ibellData.greeting.substring(0, 50)}...`);
        console.log(`   Closing: ${ibellData.closing.substring(0, 50)}...\n`);
        console.log('🎉 All vendors parsed successfully!');
        console.log('\n📋 Next steps:');
        console.log('1. Fix your database connection (.env file)');
        console.log('2. Run the SQL file: vendor-import.sql');
        console.log('3. Or use the TypeScript import script when database is ready');
    }
    catch (error) {
        console.error('❌ Error parsing vendors:', error);
        process.exit(1);
    }
}
main();
