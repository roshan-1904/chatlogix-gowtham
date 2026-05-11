import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { CustomerInsightsContext } from '../types/aiResponse.js';

export class CustomerInsightsService {
  /**
   * Get or create customer insights for a specific customer-vendor pair
   */
  async getOrCreateInsights(customerId: string, vendorId: string): Promise<CustomerInsightsContext> {
    // Validate customerId is not empty
    if (!customerId || customerId.trim() === '') {
      logger.warn({ customerId, vendorId }, 'Empty customerId provided to getOrCreateInsights - returning minimal insights');
      return {
        isNewCustomer: true,
        basicDetails: '',
        preferences: '',
        communicationStyle: '',
        currentOrder: '',
        deliveryAddress: '',
        deliveryInstructions: '',
        specialRequests: '',
        lastUpdated: new Date()
      };
    }
    
    try {
      let insights = await prisma.customerInsights.findUnique({
        where: {
          customerId_vendorId: {
            customerId,
            vendorId
          }
        }
      });

      if (!insights) {
        // Create empty insights for new customer-vendor pair
        insights = await prisma.customerInsights.create({
          data: {
            customerId,
            vendorId,
            basicDetails: '',
            preferences: '',
            communicationStyle: '',
            currentOrder: '',
            deliveryAddress: '',
            deliveryInstructions: '',
            specialRequests: ''
          }
        });
        
      }

      // Parse JSON fields (using type assertion to handle Prisma Json type)
      const whatsappLocation = (insights as any).whatsappLocation 
        ? (typeof (insights as any).whatsappLocation === 'string' 
            ? JSON.parse((insights as any).whatsappLocation) 
            : (insights as any).whatsappLocation)
        : undefined;
      
      const specialOccasions = (insights as any).specialOccasions
        ? (typeof (insights as any).specialOccasions === 'string'
            ? JSON.parse((insights as any).specialOccasions)
            : (insights as any).specialOccasions)
        : undefined;

      return {
        // Customer Basic Information
        customerName: (insights as any).customerName || undefined,
        alternativePhoneNumber: (insights as any).alternativePhoneNumber || undefined,
        email: (insights as any).email || undefined,
        preferredLanguage: (insights as any).preferredLanguage || undefined,
        
        // Customer Summary Fields
        basicDetails: insights.basicDetails || '',
        preferences: insights.preferences || '',
        communicationStyle: insights.communicationStyle || '',
        currentOrder: insights.currentOrder || '',
        
        // Delivery Information
        primaryDeliveryAddress: (insights as any).primaryDeliveryAddress || undefined,
        deliveryAddress: insights.deliveryAddress || '',
        deliveryInstructions: insights.deliveryInstructions || '',
        whatsappLocation: whatsappLocation,
        
        // Special Information
        specialRequests: insights.specialRequests || '',
        specialOccasions: specialOccasions,
        dietaryRestrictions: (insights as any).dietaryRestrictions || undefined,
        
        // Payment & Preferences
        paymentPreferences: (insights as any).paymentPreferences || undefined,
        
        // Metadata
        isNewCustomer: !(insights as any).customerName && 
                      !insights.basicDetails && 
                      !insights.preferences && 
                      !insights.communicationStyle && 
                      !insights.currentOrder && 
                      !(insights as any).primaryDeliveryAddress &&
                      !insights.deliveryAddress,
        lastUpdated: insights.lastUpdated
      };
    } catch (error) {
      logger.error({ error, customerId, vendorId }, 'Error getting/creating customer insights');
      throw error;
    }
  }

  /**
   * Generate insights summary using AI analysis of conversation history
   */
  async generateInsightsSummary(customerId: string, vendorId: string): Promise<CustomerInsightsContext> {
    try {
      // Get recent conversation messages (last 20-30)
      const conversation = await prisma.conversation.findFirst({
        where: {
          customerId,
          vendorId,
          status: 'open'
        },
        include: {
          messages: {
            orderBy: { timestamp: 'desc' },
            take: 30,
            select: {
              content: true,
              senderType: true,
              timestamp: true
            }
          },
          orders: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              orderNumber: true,
              items: true,
              totalAmount: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      if (!conversation || conversation.messages.length === 0) {
        return this.getOrCreateInsights(customerId, vendorId);
      }

      // Format conversation for AI analysis
      const conversationText = conversation.messages
        .reverse() // Get chronological order
        .map(msg => `${msg.senderType}: ${msg.content}`)
        .join('\n');

      const orderHistory = conversation.orders
        .map(order => `Order ${order.orderNumber}: ${JSON.stringify(order.items)} - ₹${order.totalAmount} (${order.status})`)
        .join('\n');

      // TODO: Implement AI analysis using OpenAI
      // For now, return basic analysis
      const basicAnalysis = this.performBasicAnalysis(conversationText, orderHistory);

      return {
        // Customer Basic Information
        customerName: basicAnalysis.customerName,
        alternativePhoneNumber: basicAnalysis.alternativePhoneNumber,
        email: basicAnalysis.email,
        preferredLanguage: basicAnalysis.preferredLanguage,
        
        // Customer Summary Fields
        basicDetails: basicAnalysis.basicDetails,
        preferences: basicAnalysis.preferences,
        communicationStyle: basicAnalysis.communicationStyle,
        currentOrder: basicAnalysis.currentOrder,
        
        // Delivery Information
        primaryDeliveryAddress: basicAnalysis.primaryDeliveryAddress,
        deliveryAddress: basicAnalysis.deliveryAddress,
        deliveryInstructions: basicAnalysis.deliveryInstructions,
        whatsappLocation: basicAnalysis.whatsappLocation,
        
        // Special Information
        specialRequests: basicAnalysis.specialRequests,
        specialOccasions: basicAnalysis.specialOccasions,
        dietaryRestrictions: basicAnalysis.dietaryRestrictions,
        
        // Payment & Preferences
        paymentPreferences: basicAnalysis.paymentPreferences,
        
        // Metadata
        isNewCustomer: false,
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error({ error, customerId, vendorId }, 'Error generating insights summary');
      return this.getOrCreateInsights(customerId, vendorId);
    }
  }

  /**
   * Update customer insights with new information
   */
  async updateInsights(
    customerId: string, 
    vendorId: string, 
    updates: Partial<CustomerInsightsContext>
  ): Promise<void> {
    try {
      const existing = await this.getOrCreateInsights(customerId, vendorId);
      
      // AI is the source of truth - simple replacement strategy
      // AI merges old + new data and provides complete values
      // Only update fields that are provided AND non-empty
      const updatedData: any = {};
      
      // Customer Basic Information
      if (updates.customerName && updates.customerName.trim().length > 0) {
        updatedData.customerName = updates.customerName.trim();
      }
      if (updates.alternativePhoneNumber && updates.alternativePhoneNumber.trim().length > 0) {
        updatedData.alternativePhoneNumber = updates.alternativePhoneNumber.trim();
      }
      if (updates.email && updates.email.trim().length > 0) {
        updatedData.email = updates.email.trim();
      }
      if (updates.preferredLanguage && updates.preferredLanguage.trim().length > 0) {
        updatedData.preferredLanguage = updates.preferredLanguage.trim();
      }
      
      // Customer Summary Fields
      if (updates.basicDetails && updates.basicDetails.trim().length > 0) {
        updatedData.basicDetails = updates.basicDetails;
      }
      if (updates.preferences && updates.preferences.trim().length > 0) {
        updatedData.preferences = updates.preferences;
      }
      if (updates.communicationStyle && updates.communicationStyle.trim().length > 0) {
        updatedData.communicationStyle = updates.communicationStyle;
      }
      if (updates.currentOrder && updates.currentOrder.trim().length > 0) {
        updatedData.currentOrder = updates.currentOrder;
      }
      
      // Delivery Information
      if (updates.primaryDeliveryAddress && updates.primaryDeliveryAddress.trim().length > 0) {
        updatedData.primaryDeliveryAddress = updates.primaryDeliveryAddress.trim();
      }
      if (updates.deliveryAddress && updates.deliveryAddress.trim().length > 0) {
        updatedData.deliveryAddress = updates.deliveryAddress;
      }
      if (updates.deliveryInstructions && updates.deliveryInstructions.trim().length > 0) {
        updatedData.deliveryInstructions = updates.deliveryInstructions;
      }
      if (updates.whatsappLocation) {
        updatedData.whatsappLocation = updates.whatsappLocation;
      }
      
      // Special Information
      if (updates.specialRequests && updates.specialRequests.trim().length > 0) {
        updatedData.specialRequests = updates.specialRequests;
      }
      if (updates.specialOccasions && Array.isArray(updates.specialOccasions) && updates.specialOccasions.length > 0) {
        updatedData.specialOccasions = updates.specialOccasions;
      }
      if (updates.dietaryRestrictions && updates.dietaryRestrictions.trim().length > 0) {
        updatedData.dietaryRestrictions = updates.dietaryRestrictions.trim();
      }
      
      // Payment & Preferences
      if (updates.paymentPreferences && updates.paymentPreferences.trim().length > 0) {
        updatedData.paymentPreferences = updates.paymentPreferences.trim();
      }
      
      // If no fields to update, skip database call
      if (Object.keys(updatedData).length === 0) {
        return;
      }
      
      await prisma.customerInsights.update({
        where: { 
          customerId_vendorId: { 
            customerId, 
            vendorId 
          } 
        },
        data: updatedData
      });

    } catch (error) {
      logger.error({ error, customerId, vendorId }, 'Error updating customer insights');
      throw error;
    }
  }

  /**
   * Format insights for AI context (handles empty state gracefully)
   */
  formatInsightsForAI(insights: CustomerInsightsContext): string {
    if (insights.isNewCustomer) {
      return "NEW CUSTOMER - No previous interaction history. Learn from this conversation.";
    }

    const sections = [];
    
    // Customer Basic Information
    if (insights.customerName) {
      sections.push(`Customer Name: ${insights.customerName}`);
    }
    if (insights.alternativePhoneNumber) {
      sections.push(`Alternative Phone Number: ${insights.alternativePhoneNumber}`);
    }
    if (insights.email) {
      sections.push(`Email: ${insights.email}`);
    }
    if (insights.preferredLanguage) {
      sections.push(`Preferred Language: ${insights.preferredLanguage}`);
    }
    
    // Customer Summary Fields
    if (insights.basicDetails) {
      sections.push(`Basic Details: ${insights.basicDetails}`);
    }
    
    if (insights.preferences) {
      sections.push(`Preferences: ${insights.preferences}`);
    }
    
    if (insights.communicationStyle) {
      sections.push(`Communication Style: ${insights.communicationStyle}`);
    }
    
    if (insights.currentOrder) {
      sections.push(`Current Order Context: ${insights.currentOrder}`);
    }
    
    // Delivery Information
    if (insights.primaryDeliveryAddress) {
      sections.push(`Primary Delivery Address: ${insights.primaryDeliveryAddress}`);
    }
    if (insights.deliveryAddress) {
      sections.push(`Delivery Address: ${insights.deliveryAddress}`);
    }
    
    if (insights.deliveryInstructions) {
      sections.push(`Delivery Instructions: ${insights.deliveryInstructions}`);
    }
    
    if (insights.whatsappLocation) {
      const loc = insights.whatsappLocation;
      const locationInfo = [
        loc.name && `Name: ${loc.name}`,
        loc.address && `Address: ${loc.address}`,
        `Coordinates: ${loc.latitude}, ${loc.longitude}`,
        loc.sharedAt && `Shared: ${loc.sharedAt}`
      ].filter(Boolean).join(', ');
      sections.push(`Location shared from WhatsApp: ${locationInfo}`);
    }
    
    // Special Information
    if (insights.specialRequests) {
      sections.push(`Special Requests: ${insights.specialRequests}`);
    }
    
    if (insights.specialOccasions && insights.specialOccasions.length > 0) {
      const occasionsText = insights.specialOccasions
        .map(occ => `${occ.name} (${occ.occasion}) - ${occ.date}`)
        .join('; ');
      sections.push(`Special Occasions: ${occasionsText}`);
    }
    
    if (insights.dietaryRestrictions) {
      sections.push(`Dietary Restrictions: ${insights.dietaryRestrictions}`);
    }
    
    // Payment & Preferences
    if (insights.paymentPreferences) {
      sections.push(`Payment Preferences: ${insights.paymentPreferences}`);
    }

    return sections.length > 0 
      ? sections.join('\n')
      : "CUSTOMER WITH LIMITED HISTORY - Gather information from this conversation.";
  }


  /**
   * Merge insight fields intelligently
   */
  private mergeInsightField(existing: string, newInfo?: string): string {
    if (!existing) return newInfo || '';
    if (!newInfo) return existing;
    
    // Smart merge: deduplicate, append new facts
    return this.intelligentMerge(existing, newInfo);
  }

  /**
   * Intelligent merge of insight fields
   */
  private intelligentMerge(existing: string, newInfo: string): string {
    // Normalize strings for comparison
    const existingLower = existing.toLowerCase().trim();
    const newInfoLower = newInfo.toLowerCase().trim();
    
    // Check if new info is already fully contained in existing (exact match)
    if (existingLower === newInfoLower) {
      return existing; // No change needed
    }
    
    // For certain fields, replace instead of merge to avoid duplicates
    // Fields that should be replaced: deliveryAddress, deliveryInstructions, specialRequests
    // These are specific facts that should be current, not accumulated
    if (existing && existing.trim().length > 0) {
      // If new info is longer and contains the existing info, use the new (more complete) version
      if (newInfoLower.includes(existingLower)) {
        return newInfo;
      }
      
      // If existing is longer and contains the new info, keep existing (more complete)
      if (existingLower.includes(newInfoLower)) {
        return existing;
      }
      
      // If they're different, extract unique sentences from both
      const existingSentences = this.extractSentences(existingLower);
      const newSentences = this.extractSentences(newInfoLower);
      
      // Find unique sentences in new info
      const uniqueNew = newSentences.filter(s => {
        return !existingSentences.some(es => {
          // Check if similar (80% match) or one contains the other
          return this.sentencesSimilar(es, s);
        });
      });
      
      // Return existing + only unique new sentences
      if (uniqueNew.length > 0) {
        return `${existing}. ${uniqueNew.join('. ')}`;
      }
      
      return existing;
    }
    
    // If existing is empty, just return new
    return newInfo;
  }
  
  /**
   * Extract sentences from text
   */
  private extractSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 5) // Filter out very short fragments
      .map(s => s.toLowerCase());
  }
  
  /**
   * Check if two sentences are similar (to avoid duplicates)
   */
  private sentencesSimilar(sentence1: string, sentence2: string): boolean {
    const s1 = sentence1.toLowerCase().trim();
    const s2 = sentence2.toLowerCase().trim();
    
    // One contains the other
    if (s1.includes(s2) || s2.includes(s1)) {
      return true;
    }
    
    // Check word overlap (if 80% of words match, consider them similar)
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    
    const common = Array.from(words1).filter(w => words2.has(w));
    const overlap = common.length / Math.max(words1.size, words2.size);
    
    return overlap >= 0.8;
  }

  /**
   * Basic analysis without AI (fallback)
   */
  private performBasicAnalysis(conversationText: string, orderHistory: string): CustomerInsightsContext {
    const analysis: CustomerInsightsContext = {
      // Customer Basic Information
      customerName: undefined,
      alternativePhoneNumber: undefined,
      email: undefined,
      preferredLanguage: undefined,
      
      // Customer Summary Fields
      basicDetails: '',
      preferences: '',
      communicationStyle: '',
      currentOrder: '',
      
      // Delivery Information
      primaryDeliveryAddress: undefined,
      deliveryAddress: '',
      deliveryInstructions: '',
      whatsappLocation: undefined,
      
      // Special Information
      specialRequests: '',
      specialOccasions: undefined,
      dietaryRestrictions: undefined,
      
      // Payment & Preferences
      paymentPreferences: undefined,
      
      // Metadata
      isNewCustomer: false,
      lastUpdated: new Date()
    };

    // Extract basic communication patterns
    if (conversationText.toLowerCase().includes('mam')) {
      analysis.communicationStyle = 'Polite, uses respectful terms like "mam"';
    }
    
    if (conversationText.toLowerCase().includes('please')) {
      analysis.communicationStyle += (analysis.communicationStyle ? '. ' : '') + 'Uses polite language';
    }

    // Extract delivery preferences
    if (conversationText.toLowerCase().includes('morning')) {
      analysis.preferences = 'Prefers morning delivery';
    }
    
    if (conversationText.toLowerCase().includes('evening')) {
      analysis.preferences = 'Prefers evening delivery';
    }

    return analysis;
  }
}
