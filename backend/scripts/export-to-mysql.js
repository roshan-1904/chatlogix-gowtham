/**
 * Export PostgreSQL Database to MySQL SQL File
 *
 * This script exports all data from your PostgreSQL database and generates
 * a MySQL-compatible SQL file with INSERT statements.
 *
 * Run with: npx tsx scripts/export-to-mysql.ts
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { existsSync } from 'fs';
import { writeFileSync } from 'fs';
import path from 'path';
// Load environment variables
const localEnvPath = path.resolve(process.cwd(), '.env');
const rootEnvPath = path.resolve(process.cwd(), '..', '.env');
const backendEnvPath = path.resolve(process.cwd(), 'backend', '.env');
if (existsSync(localEnvPath)) {
    config({ path: localEnvPath });
}
else if (existsSync(rootEnvPath)) {
    config({ path: rootEnvPath });
}
else if (existsSync(backendEnvPath)) {
    config({ path: backendEnvPath });
}
else {
    config();
}
const prisma = new PrismaClient();
// Helper function to escape MySQL strings
function escapeMySQLString(str) {
    if (str === null || str === undefined)
        return 'NULL';
    return `'${String(str).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`;
}
// Helper function to format dates for MySQL
function formatMySQLDate(date) {
    if (!date)
        return 'NULL';
    return `'${date.toISOString().slice(0, 19).replace('T', ' ')}'`;
}
// Helper function to format JSON for MySQL
function formatMySQLJSON(json) {
    if (json === null || json === undefined)
        return 'NULL';
    return escapeMySQLString(JSON.stringify(json));
}
async function exportToMySQL() {
    console.log('🚀 Starting MySQL export from PostgreSQL...\n');
    const sqlStatements = [];
    // Add MySQL setup
    sqlStatements.push('-- MySQL Export from PostgreSQL Database');
    sqlStatements.push('-- Generated: ' + new Date().toISOString());
    sqlStatements.push('');
    sqlStatements.push('SET FOREIGN_KEY_CHECKS = 0;');
    sqlStatements.push('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
    sqlStatements.push('SET time_zone = "+00:00";');
    sqlStatements.push('');
    try {
        // Export Vendors
        console.log('📦 Exporting Vendors...');
        const vendors = await prisma.vendor.findMany();
        if (vendors.length > 0) {
            sqlStatements.push('-- Vendors');
            sqlStatements.push('TRUNCATE TABLE `Vendor`;');
            for (const vendor of vendors) {
                const values = [
                    escapeMySQLString(vendor.id),
                    escapeMySQLString(vendor.businessName),
                    escapeMySQLString(vendor.phone),
                    escapeMySQLString(vendor.email),
                    escapeMySQLString(vendor.subscriptionPlan),
                    escapeMySQLString(vendor.subscriptionStatus),
                    vendor.walletBalanceMilli,
                    formatMySQLDate(vendor.createdAt),
                    formatMySQLDate(vendor.updatedAt),
                    escapeMySQLString(vendor.aiBotName),
                    escapeMySQLString(vendor.aiPersonality),
                    escapeMySQLString(vendor.aiSystemPrompt),
                    escapeMySQLString(vendor.aiProducts),
                    escapeMySQLString(vendor.aiGreeting),
                    escapeMySQLString(vendor.aiClosing),
                    escapeMySQLString(vendor.aiModel),
                    vendor.aiPreparationTimeMinutes ?? 'NULL',
                    escapeMySQLString(vendor.aiContentResponsibilities),
                    escapeMySQLString(vendor.aiContentConversationRules),
                    escapeMySQLString(vendor.aiContentImportantInstructions),
                ];
                sqlStatements.push(`INSERT INTO \`Vendor\` (\`id\`, \`businessName\`, \`phone\`, \`email\`, \`subscriptionPlan\`, \`subscriptionStatus\`, \`walletBalanceMilli\`, \`createdAt\`, \`updatedAt\`, \`aiBotName\`, \`aiPersonality\`, \`aiSystemPrompt\`, \`aiProducts\`, \`aiGreeting\`, \`aiClosing\`, \`aiModel\`, \`aiPreparationTimeMinutes\`, \`aiContentResponsibilities\`, \`aiContentConversationRules\`, \`aiContentImportantInstructions\`) VALUES (${values.join(', ')});`);
            }
            sqlStatements.push('');
            console.log(`   ✓ Exported ${vendors.length} vendors`);
        }
        // Export Customers
        console.log('👥 Exporting Customers...');
        const customers = await prisma.customer.findMany();
        if (customers.length > 0) {
            sqlStatements.push('-- Customers');
            sqlStatements.push('TRUNCATE TABLE `Customer`;');
            for (const customer of customers) {
                const values = [
                    escapeMySQLString(customer.id),
                    escapeMySQLString(customer.phone),
                    customer.lastInteraction ? formatMySQLDate(customer.lastInteraction) : 'NULL',
                ];
                sqlStatements.push(`INSERT INTO \`Customer\` (\`id\`, \`phone\`, \`lastInteraction\`) VALUES (${values.join(', ')});`);
            }
            sqlStatements.push('');
            console.log(`   ✓ Exported ${customers.length} customers`);
        }
        // Export Conversations
        console.log('💬 Exporting Conversations...');
        const conversations = await prisma.conversation.findMany();
        if (conversations.length > 0) {
            sqlStatements.push('-- Conversations');
            sqlStatements.push('TRUNCATE TABLE `Conversation`;');
            for (const conv of conversations) {
                const values = [
                    escapeMySQLString(conv.id),
                    escapeMySQLString(conv.vendorId),
                    escapeMySQLString(conv.customerId),
                    escapeMySQLString(conv.status),
                    conv.aiPaused ? 1 : 0,
                    formatMySQLDate(conv.createdAt),
                    formatMySQLDate(conv.updatedAt),
                ];
                sqlStatements.push(`INSERT INTO \`Conversation\` (\`id\`, \`vendorId\`, \`customerId\`, \`status\`, \`aiPaused\`, \`createdAt\`, \`updatedAt\`) VALUES (${values.join(', ')});`);
            }
            sqlStatements.push('');
            console.log(`   ✓ Exported ${conversations.length} conversations`);
        }
        // Export Messages
        console.log('📨 Exporting Messages...');
        const messages = await prisma.message.findMany();
        if (messages.length > 0) {
            sqlStatements.push('-- Messages');
            sqlStatements.push('TRUNCATE TABLE `Message`;');
            for (const msg of messages) {
                const values = [
                    escapeMySQLString(msg.id),
                    escapeMySQLString(msg.conversationId),
                    escapeMySQLString(msg.senderType),
                    escapeMySQLString(msg.content),
                    escapeMySQLString(msg.type),
                    formatMySQLDate(msg.timestamp),
                    msg.aiTokensUsed,
                ];
                sqlStatements.push(`INSERT INTO \`Message\` (\`id\`, \`conversationId\`, \`senderType\`, \`content\`, \`type\`, \`timestamp\`, \`aiTokensUsed\`) VALUES (${values.join(', ')});`);
            }
            sqlStatements.push('');
            console.log(`   ✓ Exported ${messages.length} messages`);
        }
        // Export CreditUsages
        console.log('💳 Exporting Credit Usages...');
        const creditUsages = await prisma.creditUsage.findMany();
        if (creditUsages.length > 0) {
            sqlStatements.push('-- Credit Usages');
            sqlStatements.push('TRUNCATE TABLE `CreditUsage`;');
            for (const usage of creditUsages) {
                const values = [
                    escapeMySQLString(usage.id),
                    escapeMySQLString(usage.vendorId),
                    escapeMySQLString(usage.conversationId),
                    usage.chargedMilli,
                    formatMySQLDate(usage.usageDate),
                    // NOT NULL since the millirupee cutover — a charge with no
                    // conversation (catalog import, sandbox) is identified only by this.
                    escapeMySQLString(usage.source),
                    escapeMySQLString(usage.conversationType),
                    escapeMySQLString(usage.externalId),
                ];
                sqlStatements.push(`INSERT INTO \`CreditUsage\` (\`id\`, \`vendorId\`, \`conversationId\`, \`chargedMilli\`, \`usageDate\`, \`source\`, \`conversationType\`, \`externalId\`) VALUES (${values.join(', ')});`);
            }
            sqlStatements.push('');
            console.log(`   ✓ Exported ${creditUsages.length} credit usages`);
        }
        // Export BillingHistory
        console.log('💰 Exporting Billing History...');
        const billingHistory = await prisma.billingHistory.findMany();
        if (billingHistory.length > 0) {
            sqlStatements.push('-- Billing History');
            sqlStatements.push('TRUNCATE TABLE `BillingHistory`;');
            for (const billing of billingHistory) {
                const values = [
                    escapeMySQLString(billing.id),
                    escapeMySQLString(billing.vendorId),
                    formatMySQLDate(billing.billingDate),
                    billing.planPrice,
                    billing.extraUsageCharges,
                    billing.totalAmount,
                    escapeMySQLString(billing.paymentStatus),
                ];
                sqlStatements.push(`INSERT INTO \`BillingHistory\` (\`id\`, \`vendorId\`, \`billingDate\`, \`planPrice\`, \`extraUsageCharges\`, \`totalAmount\`, \`paymentStatus\`) VALUES (${values.join(', ')});`);
            }
            sqlStatements.push('');
            console.log(`   ✓ Exported ${billingHistory.length} billing records`);
        }
        // Export WalletTransactions
        console.log('💵 Exporting Wallet Transactions...');
        const walletTransactions = await prisma.walletTransaction.findMany();
        if (walletTransactions.length > 0) {
            sqlStatements.push('-- Wallet Transactions');
            sqlStatements.push('TRUNCATE TABLE `WalletTransaction`;');
            for (const tx of walletTransactions) {
                const values = [
                    escapeMySQLString(tx.id),
                    escapeMySQLString(tx.vendorId),
                    escapeMySQLString(tx.transactionType),
                    tx.amountMilli,
                    tx.balanceBeforeMilli,
                    tx.balanceAfterMilli,
                    formatMySQLJSON(tx.metadata),
                    formatMySQLDate(tx.transactionDate),
                ];
                sqlStatements.push(`INSERT INTO \`WalletTransaction\` (\`id\`, \`vendorId\`, \`transactionType\`, \`amountMilli\`, \`balanceBeforeMilli\`, \`balanceAfterMilli\`, \`metadata\`, \`transactionDate\`) VALUES (${values.join(', ')});`);
            }
            sqlStatements.push('');
            console.log(`   ✓ Exported ${walletTransactions.length} wallet transactions`);
        }
        // Export WhatsAppNumbers
        console.log('📱 Exporting WhatsApp Numbers...');
        const whatsappNumbers = await prisma.whatsAppNumber.findMany();
        if (whatsappNumbers.length > 0) {
            sqlStatements.push('-- WhatsApp Numbers');
            sqlStatements.push('TRUNCATE TABLE `WhatsAppNumber`;');
            for (const num of whatsappNumbers) {
                const values = [
                    escapeMySQLString(num.id),
                    escapeMySQLString(num.vendorId),
                    escapeMySQLString(num.phoneNumberId),
                    escapeMySQLString(num.wabaId),
                    formatMySQLDate(num.createdAt),
                ];
                sqlStatements.push(`INSERT INTO \`WhatsAppNumber\` (\`id\`, \`vendorId\`, \`phoneNumberId\`, \`wabaId\`, \`createdAt\`) VALUES (${values.join(', ')});`);
            }
            sqlStatements.push('');
            console.log(`   ✓ Exported ${whatsappNumbers.length} WhatsApp numbers`);
        }
        // Export Orders
        console.log('🛒 Exporting Orders...');
        const orders = await prisma.order.findMany();
        if (orders.length > 0) {
            sqlStatements.push('-- Orders');
            sqlStatements.push('TRUNCATE TABLE `Order`;');
            for (const order of orders) {
                const values = [
                    escapeMySQLString(order.id),
                    escapeMySQLString(order.vendorId),
                    escapeMySQLString(order.customerId),
                    escapeMySQLString(order.conversationId),
                    escapeMySQLString(order.orderNumber),
                    escapeMySQLString(order.status),
                    formatMySQLJSON(order.items),
                    order.totalAmount,
                    escapeMySQLString(order.deliveryAddress),
                    escapeMySQLString(order.deliveryInstructions),
                    escapeMySQLString(order.specialRequests),
                    order.estimatedDelivery ? formatMySQLDate(order.estimatedDelivery) : 'NULL',
                    order.confirmedAt ? formatMySQLDate(order.confirmedAt) : 'NULL',
                    order.preparedAt ? formatMySQLDate(order.preparedAt) : 'NULL',
                    order.deliveredAt ? formatMySQLDate(order.deliveredAt) : 'NULL',
                    order.cancelledAt ? formatMySQLDate(order.cancelledAt) : 'NULL',
                    escapeMySQLString(order.cancellationReason),
                    formatMySQLDate(order.createdAt),
                    formatMySQLDate(order.updatedAt),
                ];
                sqlStatements.push(`INSERT INTO \`Order\` (\`id\`, \`vendorId\`, \`customerId\`, \`conversationId\`, \`orderNumber\`, \`status\`, \`items\`, \`totalAmount\`, \`deliveryAddress\`, \`deliveryInstructions\`, \`specialRequests\`, \`estimatedDelivery\`, \`confirmedAt\`, \`preparedAt\`, \`deliveredAt\`, \`cancelledAt\`, \`cancellationReason\`, \`createdAt\`, \`updatedAt\`) VALUES (${values.join(', ')});`);
            }
            sqlStatements.push('');
            console.log(`   ✓ Exported ${orders.length} orders`);
        }
        // Export CustomerInsights
        console.log('🔍 Exporting Customer Insights...');
        const customerInsights = await prisma.customerInsights.findMany();
        if (customerInsights.length > 0) {
            sqlStatements.push('-- Customer Insights');
            sqlStatements.push('TRUNCATE TABLE `CustomerInsights`;');
            for (const insight of customerInsights) {
                const values = [
                    escapeMySQLString(insight.id),
                    escapeMySQLString(insight.customerId),
                    escapeMySQLString(insight.vendorId),
                    escapeMySQLString(insight.customerName),
                    escapeMySQLString(insight.alternativePhoneNumber),
                    escapeMySQLString(insight.email),
                    escapeMySQLString(insight.preferredLanguage),
                    escapeMySQLString(insight.basicDetails),
                    escapeMySQLString(insight.purchaseHistory),
                    escapeMySQLString(insight.preferences),
                    escapeMySQLString(insight.communicationStyle),
                    escapeMySQLString(insight.currentOrder),
                    escapeMySQLString(insight.primaryDeliveryAddress),
                    escapeMySQLString(insight.deliveryAddress),
                    escapeMySQLString(insight.deliveryInstructions),
                    formatMySQLJSON(insight.whatsappLocation),
                    escapeMySQLString(insight.specialRequests),
                    formatMySQLJSON(insight.specialOccasions),
                    escapeMySQLString(insight.dietaryRestrictions),
                    escapeMySQLString(insight.paymentPreferences),
                    formatMySQLDate(insight.lastUpdated),
                    formatMySQLDate(insight.createdAt),
                ];
                sqlStatements.push(`INSERT INTO \`CustomerInsights\` (\`id\`, \`customerId\`, \`vendorId\`, \`customerName\`, \`alternativePhoneNumber\`, \`email\`, \`preferredLanguage\`, \`basicDetails\`, \`purchaseHistory\`, \`preferences\`, \`communicationStyle\`, \`currentOrder\`, \`primaryDeliveryAddress\`, \`deliveryAddress\`, \`deliveryInstructions\`, \`whatsappLocation\`, \`specialRequests\`, \`specialOccasions\`, \`dietaryRestrictions\`, \`paymentPreferences\`, \`lastUpdated\`, \`createdAt\`) VALUES (${values.join(', ')});`);
            }
            sqlStatements.push('');
            console.log(`   ✓ Exported ${customerInsights.length} customer insights`);
        }
        sqlStatements.push('SET FOREIGN_KEY_CHECKS = 1;');
        // Write to file
        const outputPath = path.resolve(process.cwd(), 'postgresql_export_mysql.sql');
        writeFileSync(outputPath, sqlStatements.join('\n'), 'utf-8');
        console.log('\n✅ Export completed successfully!');
        console.log(`📄 MySQL SQL file saved to: ${outputPath}`);
        console.log('\n⚠️  Note: This file contains INSERT statements only.');
        console.log('   You will need to create the MySQL schema separately.');
        console.log('   Consider using Prisma with MySQL provider to generate the schema.');
    }
    catch (error) {
        console.error('❌ Error during export:', error);
        throw error;
    }
    finally {
        await prisma.$disconnect();
    }
}
// Run the export
exportToMySQL()
    .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
