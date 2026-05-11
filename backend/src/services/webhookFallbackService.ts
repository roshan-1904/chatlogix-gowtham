import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';

const LOG_DIR = join(process.cwd(), 'logs', 'webhook-failures');

interface LogEntry {
  timestamp: string;
  messageData: {
    type: string;
    vendorId: string;
    customerPhone: string;
    content: string;
    phoneNumberId: string;
    whatsappMessageId?: string;
    timestamp: string;
  };
  processed: boolean;
}

/**
 * Initialize log directory
 */
function ensureLogDirectory(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Sanitize filename to remove special characters
 */
function sanitizeFilename(str: string): string {
  return str.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Get log file path for a conversation
 * Uses customerId-vendorId format if customerId is available, otherwise uses customerPhone-vendorId
 */
async function getLogFilePath(vendorId: string, customerPhone: string, customerId?: string): Promise<string> {
  ensureLogDirectory();
  
  let filename: string;
  if (customerId) {
    filename = `${sanitizeFilename(customerId)}-${sanitizeFilename(vendorId)}.log`;
  } else {
    // Try to get customerId from database
    try {
      const customer = await prisma.customer.findUnique({
        where: { phone: customerPhone }
      });
      if (customer) {
        filename = `${sanitizeFilename(customer.id)}-${sanitizeFilename(vendorId)}.log`;
      } else {
        // Fallback to phone-vendorId format
        filename = `${sanitizeFilename(customerPhone)}-${sanitizeFilename(vendorId)}.log`;
      }
    } catch (error) {
      // If DB lookup fails, use phone-vendorId format
      logger.warn({ error, vendorId, customerPhone }, 'Failed to lookup customerId for log file, using phone number');
      filename = `${sanitizeFilename(customerPhone)}-${sanitizeFilename(vendorId)}.log`;
    }
  }
  
  return join(LOG_DIR, filename);
}

/**
 * Write message to conversation-specific log file
 */
export async function logMessageToFile(messageData: {
  type: string;
  vendorId: string;
  customerPhone: string;
  content: string;
  phoneNumberId: string;
  whatsappMessageId?: string;
  timestamp: string;
  customerId?: string;
}): Promise<void> {
  try {
    ensureLogDirectory();
    
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      messageData: {
        type: messageData.type,
        vendorId: messageData.vendorId,
        customerPhone: messageData.customerPhone,
        content: messageData.content,
        phoneNumberId: messageData.phoneNumberId,
        whatsappMessageId: messageData.whatsappMessageId,
        timestamp: messageData.timestamp
      },
      processed: false
    };
    
    const filePath = await getLogFilePath(
      messageData.vendorId,
      messageData.customerPhone,
      messageData.customerId
    );
    
    const logLine = JSON.stringify(logEntry) + '\n';
    writeFileSync(filePath, logLine, { flag: 'a', encoding: 'utf8' });
    
    logger.info({ 
      filePath, 
      vendorId: messageData.vendorId, 
      customerPhone: messageData.customerPhone 
    }, 'Message logged to fallback file');
  } catch (error) {
    logger.error({ err: error, messageData }, 'Failed to write message to log file');
    throw error;
  }
}

/**
 * Read all unprocessed messages from all log files
 */
export async function readPendingMessages(): Promise<Array<{ entry: LogEntry; filePath: string; lineNumber: number }>> {
  try {
    ensureLogDirectory();
    
    const pendingMessages: Array<{ entry: LogEntry; filePath: string; lineNumber: number }> = [];
    
    if (!existsSync(LOG_DIR)) {
      return pendingMessages;
    }
    
    const files = readdirSync(LOG_DIR).filter(file => file.endsWith('.log'));
    
    for (const file of files) {
      const filePath = join(LOG_DIR, file);
      try {
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());
        
        for (let i = 0; i < lines.length; i++) {
          try {
            const entry: LogEntry = JSON.parse(lines[i]);
            if (!entry.processed) {
              pendingMessages.push({ entry, filePath, lineNumber: i });
            }
          } catch (parseError) {
            logger.warn({ error: parseError, filePath, lineNumber: i }, 'Failed to parse log entry');
          }
        }
      } catch (readError) {
        logger.warn({ error: readError, filePath }, 'Failed to read log file');
      }
    }
    
    logger.info({ count: pendingMessages.length }, 'Read pending messages from log files');
    return pendingMessages;
  } catch (error) {
    logger.error({ err: error }, 'Failed to read pending messages from log files');
    throw error;
  }
}

/**
 * Mark a message as processed in the log file
 */
export async function markMessageProcessed(
  logEntry: LogEntry,
  filePath: string,
  lineNumber: number
): Promise<void> {
  try {
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    if (lineNumber >= 0 && lineNumber < lines.length) {
      const entry: LogEntry = JSON.parse(lines[lineNumber]);
      entry.processed = true;
      lines[lineNumber] = JSON.stringify(entry);
      
      writeFileSync(filePath, lines.join('\n'), { encoding: 'utf8' });
      
      logger.info({ filePath, lineNumber }, 'Marked message as processed in log file');
    } else {
      logger.warn({ filePath, lineNumber }, 'Invalid line number for marking message as processed');
    }
  } catch (error) {
    logger.error({ err: error, filePath, lineNumber }, 'Failed to mark message as processed');
    throw error;
  }
}

