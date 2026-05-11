import { readFileSync } from 'fs';
class TrainingDataValidator {
    constructor() {
        this.examples = [];
        this.issues = [];
    }
    async validateTrainingData(filename) {
        console.log(`🔍 Validating training data: ${filename}`);
        try {
            // Read and parse JSONL file
            const content = readFileSync(filename, 'utf8');
            const lines = content.trim().split('\n');
            console.log(`📄 Found ${lines.length} training examples`);
            // Parse each example
            for (let i = 0; i < lines.length; i++) {
                try {
                    const example = JSON.parse(lines[i]);
                    this.examples.push(example);
                    this.validateExample(example, i + 1);
                }
                catch (error) {
                    this.issues.push(`Line ${i + 1}: Invalid JSON - ${error}`);
                }
            }
            // Generate quality report
            this.generateQualityReport();
        }
        catch (error) {
            console.error('❌ Error reading file:', error);
        }
    }
    validateExample(example, lineNumber) {
        // Check structure
        if (!example.messages || !Array.isArray(example.messages)) {
            this.issues.push(`Line ${lineNumber}: Missing or invalid messages array`);
            return;
        }
        if (example.messages.length < 2) {
            this.issues.push(`Line ${lineNumber}: Too few messages (minimum 2 required)`);
        }
        // Check message roles
        const roles = example.messages.map(msg => msg.role);
        const validRoles = ['system', 'user', 'assistant'];
        for (let i = 0; i < roles.length; i++) {
            if (!validRoles.includes(roles[i])) {
                this.issues.push(`Line ${lineNumber}, Message ${i + 1}: Invalid role '${roles[i]}'`);
            }
        }
        // Check for required roles
        if (!roles.includes('system')) {
            this.issues.push(`Line ${lineNumber}: Missing system message`);
        }
        if (!roles.includes('user')) {
            this.issues.push(`Line ${lineNumber}: Missing user message`);
        }
        if (!roles.includes('assistant')) {
            this.issues.push(`Line ${lineNumber}: Missing assistant message`);
        }
        // Check message content
        for (let i = 0; i < example.messages.length; i++) {
            const msg = example.messages[i];
            if (!msg.content || typeof msg.content !== 'string') {
                this.issues.push(`Line ${lineNumber}, Message ${i + 1}: Missing or invalid content`);
            }
            else if (msg.content.trim().length === 0) {
                this.issues.push(`Line ${lineNumber}, Message ${i + 1}: Empty content`);
            }
            else if (msg.content.length > 4000) {
                this.issues.push(`Line ${lineNumber}, Message ${i + 1}: Content too long (${msg.content.length} chars)`);
            }
        }
        // Check conversation flow
        if (roles[0] !== 'system') {
            this.issues.push(`Line ${lineNumber}: First message should be system role`);
        }
        if (roles[roles.length - 1] !== 'assistant') {
            this.issues.push(`Line ${lineNumber}: Last message should be assistant role`);
        }
    }
    generateQualityReport() {
        console.log('\n📊 Training Data Quality Report');
        console.log('='.repeat(50));
        // Basic stats
        console.log(`📈 Total Examples: ${this.examples.length}`);
        console.log(`❌ Issues Found: ${this.issues.length}`);
        if (this.issues.length === 0) {
            console.log('✅ All examples passed validation!');
        }
        else {
            console.log('\n🚨 Issues Found:');
            this.issues.forEach(issue => console.log(`  - ${issue}`));
        }
        // Content analysis
        this.analyzeContent();
        // Vendor analysis
        this.analyzeVendors();
        // Conversation patterns
        this.analyzeConversationPatterns();
        console.log('\n🎯 Quality Score:', this.calculateQualityScore());
    }
    analyzeContent() {
        console.log('\n📝 Content Analysis:');
        const systemPrompts = this.examples.map(ex => ex.messages[0]?.content || '');
        const userMessages = this.examples.flatMap(ex => ex.messages.filter(msg => msg.role === 'user').map(msg => msg.content));
        const assistantMessages = this.examples.flatMap(ex => ex.messages.filter(msg => msg.role === 'assistant').map(msg => msg.content));
        // System prompt analysis
        const avgSystemLength = systemPrompts.reduce((sum, prompt) => sum + prompt.length, 0) / systemPrompts.length;
        console.log(`  - Average system prompt length: ${Math.round(avgSystemLength)} characters`);
        // User message analysis
        const avgUserLength = userMessages.reduce((sum, msg) => sum + msg.length, 0) / userMessages.length;
        console.log(`  - Average user message length: ${Math.round(avgUserLength)} characters`);
        // Assistant message analysis
        const avgAssistantLength = assistantMessages.reduce((sum, msg) => sum + msg.length, 0) / assistantMessages.length;
        console.log(`  - Average assistant response length: ${Math.round(avgAssistantLength)} characters`);
        // Emoji usage
        const emojiCount = assistantMessages.filter(msg => /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u.test(msg)).length;
        console.log(`  - Examples with emojis: ${emojiCount}/${assistantMessages.length} (${Math.round(emojiCount / assistantMessages.length * 100)}%)`);
    }
    analyzeVendors() {
        console.log('\n🏪 Vendor Analysis:');
        const vendors = new Map();
        this.examples.forEach(ex => {
            const systemPrompt = ex.messages[0]?.content || '';
            if (systemPrompt.includes('LushBot')) {
                vendors.set('Lush Fresh Juices', (vendors.get('Lush Fresh Juices') || 0) + 1);
            }
            else if (systemPrompt.includes('BrownieBakerBot')) {
                vendors.set('Ibell Creations', (vendors.get('Ibell Creations') || 0) + 1);
            }
            else if (systemPrompt.includes('friendly AI assistant')) {
                vendors.set('General Assistant', (vendors.get('General Assistant') || 0) + 1);
            }
            else {
                vendors.set('Other', (vendors.get('Other') || 0) + 1);
            }
        });
        vendors.forEach((count, vendor) => {
            console.log(`  - ${vendor}: ${count} examples`);
        });
    }
    analyzeConversationPatterns() {
        console.log('\n💬 Conversation Patterns:');
        const singleTurn = this.examples.filter(ex => ex.messages.length === 3).length;
        const multiTurn = this.examples.filter(ex => ex.messages.length > 3).length;
        console.log(`  - Single-turn conversations: ${singleTurn}`);
        console.log(`  - Multi-turn conversations: ${multiTurn}`);
        // Common user intents
        const userMessages = this.examples.flatMap(ex => ex.messages.filter(msg => msg.role === 'user').map(msg => msg.content.toLowerCase()));
        const intents = {
            greeting: userMessages.filter(msg => /^(hi|hello|hey|good morning|good afternoon)/.test(msg)).length,
            product: userMessages.filter(msg => msg.includes('what') && (msg.includes('have') || msg.includes('product'))).length,
            price: userMessages.filter(msg => msg.includes('price') || msg.includes('cost')).length,
            order: userMessages.filter(msg => msg.includes('order') || msg.includes('want to buy')).length,
            help: userMessages.filter(msg => msg.includes('help') || msg.includes('support')).length
        };
        console.log('  - Common intents:');
        Object.entries(intents).forEach(([intent, count]) => {
            if (count > 0) {
                console.log(`    - ${intent}: ${count} examples`);
            }
        });
    }
    calculateQualityScore() {
        const totalChecks = this.examples.length * 5; // 5 checks per example
        const passedChecks = totalChecks - this.issues.length;
        const score = Math.round((passedChecks / totalChecks) * 100);
        if (score >= 95)
            return `🟢 ${score}% (Excellent)`;
        if (score >= 85)
            return `🟡 ${score}% (Good)`;
        if (score >= 70)
            return `🟠 ${score}% (Fair)`;
        return `🔴 ${score}% (Needs Improvement)`;
    }
}
// Run validation
const validator = new TrainingDataValidator();
// Validate both files
Promise.all([
    validator.validateTrainingData('training-data.jsonl'),
    validator.validateTrainingData('extended-training-data.jsonl')
])
    .then(() => {
    console.log('\n✅ Validation completed successfully!');
    process.exit(0);
})
    .catch((error) => {
    console.error('❌ Validation failed:', error);
    process.exit(1);
});
