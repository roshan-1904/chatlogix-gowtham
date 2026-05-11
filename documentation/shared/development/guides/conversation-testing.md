# Conversation Testing Interface

This interface allows you to test the ChatLogix conversation system seamlessly with different vendors and customer scenarios.

## Features

### 🎯 **Vendor Selection**
- Choose from registered vendors in the system
- View vendor details including subscription plan and wallet balance
- See AI bot configuration (bot name, greeting messages)

### 📱 **Customer Simulation**
- Enter any customer phone number for testing
- Simulate different customer personas
- Test with various phone number formats

### 💬 **Real-time Conversation Testing**
- Send messages as a customer
- Receive AI-generated responses in real-time
- See conversation context and history
- Test different message types and intents

### 📊 **Conversation History**
- View previous conversations for each vendor
- Click on any conversation to resume it
- See conversation metadata (message count, last updated)

### 🎨 **Modern UI**
- Clean, responsive design
- Real-time message display with timestamps
- Loading states and error handling
- Smooth animations and transitions

## How to Use

1. **Start the Application**
   ```bash
   # Backend
   cd backend
   npm run dev
   
   # Frontend
   cd frontend
   npm run dev
   ```

2. **Select a Vendor**
   - Choose from the dropdown list of available vendors
   - Each vendor has their own AI personality and configuration

3. **Enter Customer Phone**
   - Use any phone number format (e.g., 919999999999)
   - This simulates a customer calling the vendor

4. **Start Conversation**
   - Click "Start Conversation" to begin
   - The AI will use the vendor's specific configuration

5. **Send Messages**
   - Type messages as if you're the customer
   - Press Enter or click Send
   - Watch the AI respond with context-aware replies

6. **View History**
   - Click "Show History" to see previous conversations
   - Click on any conversation to resume it

## Testing Scenarios

### Pricing Queries
- "What are your prices?"
- "How much does it cost?"
- "Tell me about your plans"

### Order Status
- "Where is my order?"
- "Can you check my order status?"
- "I need to track my delivery"

### Support Requests
- "I need help with..."
- "How do I use this feature?"
- "Can you explain how this works?"

### Cancellation Requests
- "I want to cancel my order"
- "Can I get a refund?"
- "I need to return this"

## Technical Details

### API Endpoints
- `GET /api/vendors` - List all vendors
- `POST /api/conversations/test` - Create test conversation
- `POST /api/conversations/test/message` - Send test message
- `GET /api/conversations/:id/messages` - Get conversation messages
- `GET /api/conversations/history/:vendorId` - Get conversation history

### AI Features
- Intent classification (pricing, order status, support, cancellation)
- Context-aware responses using conversation history
- Vendor-specific AI personalities and prompts
- Fallback responses when AI is unavailable

### Database Integration
- Real conversation storage
- Message persistence
- Customer and vendor tracking
- Credit usage monitoring

## Troubleshooting

### Common Issues
1. **No vendors available**: Make sure vendors are registered in the system
2. **AI not responding**: Check if OpenAI API key is configured
3. **Messages not saving**: Verify database connection
4. **Credits exhausted**: Recharge vendor wallet for testing

### Error Messages
- "Please select a vendor" - Choose a vendor from the dropdown
- "Failed to start conversation" - Check backend logs for errors
- "Insufficient credits" - Recharge the vendor's wallet
- "Error loading vendors" - Check backend API connectivity

## Development Notes

The interface is built with React and TypeScript, using modern hooks and state management. The backend uses Express.js with Prisma for database operations and integrates with OpenAI for AI responses.

All conversation data is stored in the database, making it easy to analyze conversation patterns and improve the AI responses over time.
