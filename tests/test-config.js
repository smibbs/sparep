// Shared test configuration for Migration 31 and schema testing
// This file provides common utilities and configuration for all test files

class TestConfig {
    constructor() {
        this.supabase = null;
        this.testResults = [];
        this.currentTest = null;
    }

    // Initialize Supabase client (requires config to be loaded)
    async initSupabase() {
        if (typeof window.supabaseConfig === 'undefined') {
            throw new Error('Supabase configuration not found. Please ensure config/supabase-config.json is loaded.');
        }

        // Check if Supabase library is loaded - try different possible locations
        let createClient;
        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            createClient = window.supabase.createClient;
        } else if (typeof supabase !== 'undefined' && supabase.createClient) {
            createClient = supabase.createClient;
        } else if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'undefined') {
            // Sometimes the CDN puts createClient directly on the global
            createClient = window.supabase;
        } else {
            // Debug information to help troubleshoot
            console.log('Debug info:');
            console.log('typeof window.supabase:', typeof window.supabase);
            console.log('typeof supabase:', typeof supabase);
            console.log('window.supabase:', window.supabase);
            console.log('Available globals:', Object.keys(window).filter(k => k.toLowerCase().includes('supabase')));
            throw new Error('Supabase library not loaded. Please ensure the Supabase script is included before test-config.js. Check console for debug info.');
        }

        this.supabase = createClient(
            window.supabaseConfig.url,
            window.supabaseConfig.anonKey
        );

        // Test connection with a function call instead of querying a table directly
        try {
            const result = await this.supabase.rpc('flag_card_for_review', {
                p_card_id: '00000000-0000-0000-0000-000000000000',
                p_reason: 'test'
            });
            
            const { error } = result || {};
            
            // We expect this to fail with auth error, not connection error
            // If it fails with connection error, that's a real problem
            if (error && (error.message.includes('network') || error.message.includes('connection'))) {
                throw new Error(`Failed to connect to Supabase: ${error.message}`);
            }
        } catch (err) {
            if (err.message && (err.message.includes('network') || err.message.includes('connection'))) {
                throw new Error(`Failed to connect to Supabase: ${err.message}`);
            }
            // Any other error means we connected successfully but hit expected security barriers
            console.log('ℹ️ Connection test hit expected security barrier (good!)');
        }

        console.log('✅ Supabase connection established');
        return this.supabase;
    }

    // Create a test user session for testing (mock authentication)
    async createTestSession(userTier = 'free') {
        // Note: In real tests, you'd need a proper test user
        // This is a placeholder for the testing approach
        console.warn('⚠️ Test session creation - implement with actual test user credentials');
        return {
            user: {
                id: 'test-user-id',
                email: 'test@example.com'
            },
            tier: userTier
        };
    }

    // Test runner utilities
    startTest(testName) {
        this.currentTest = {
            name: testName,
            startTime: Date.now(),
            status: 'running'
        };
        console.log(`🧪 Starting test: ${testName}`);
    }

    async runTest(testName, testFunction) {
        this.startTest(testName);
        try {
            await testFunction();
            this.passTest(`✅ PASS: ${testName}`);
        } catch (error) {
            this.failTest(`❌ FAIL: ${testName} - ${error.message}`);
        }
    }

    passTest(message) {
        if (this.currentTest) {
            this.currentTest.status = 'passed';
            this.currentTest.endTime = Date.now();
            this.currentTest.duration = this.currentTest.endTime - this.currentTest.startTime;
        }
        
        this.testResults.push({
            ...this.currentTest,
            message,
            status: 'passed'
        });
        
        this.logResult(message, 'passed');
        this.currentTest = null;
    }

    failTest(message) {
        if (this.currentTest) {
            this.currentTest.status = 'failed';
            this.currentTest.endTime = Date.now();
            this.currentTest.duration = this.currentTest.endTime - this.currentTest.startTime;
        }

        this.testResults.push({
            ...this.currentTest,
            message,
            status: 'failed'
        });
        
        this.logResult(message, 'failed');
        this.currentTest = null;
    }

    logResult(message, status) {
        const resultElement = document.getElementById('test-results');
        if (resultElement) {
            const div = document.createElement('div');
            div.className = `test-result ${status}`;
            div.textContent = message;
            resultElement.appendChild(div);
        }
        console.log(message);
    }

    // Assertion helpers
    assertEqual(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
        }
    }

    assertTrue(condition, message = '') {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}. Expected true, got ${condition}`);
        }
    }

    assertThrows(fn, expectedError = null, message = '') {
        try {
            fn();
            throw new Error(`Assertion failed: ${message}. Expected function to throw an error`);
        } catch (error) {
            if (expectedError && !error.message.includes(expectedError)) {
                throw new Error(`Assertion failed: ${message}. Expected error containing "${expectedError}", got "${error.message}"`);
            }
        }
    }

    async assertThrowsAsync(fn, expectedError = null, message = '') {
        try {
            await fn();
            throw new Error(`Assertion failed: ${message}. Expected async function to throw an error`);
        } catch (error) {
            if (expectedError && !error.message.includes(expectedError)) {
                throw new Error(`Assertion failed: ${message}. Expected error containing "${expectedError}", got "${error.message}"`);
            }
        }
    }

    // Database testing utilities
    async callFunction(functionName, params) {
        const result = await this.supabase.rpc(functionName, params);
        const { data, error } = result || {};
        if (error) {
            throw new Error(`Function call failed: ${error.message}`);
        }
        return data;
    }

    async queryTable(tableName, query = {}) {
        let queryBuilder = this.supabase.from(tableName);
        
        if (query.select) {
            queryBuilder = queryBuilder.select(query.select);
        } else {
            queryBuilder = queryBuilder.select('*');
        }
        
        if (query.eq) {
            Object.entries(query.eq).forEach(([key, value]) => {
                queryBuilder = queryBuilder.eq(key, value);
            });
        }
        
        if (query.limit) {
            queryBuilder = queryBuilder.limit(query.limit);
        }

        const result = await queryBuilder;
        const { data, error } = result || {};
        if (error) {
            // Don't throw on permission denied - that's expected for RLS-protected tables
            if (error.message.includes('permission denied') || error.message.includes('policy')) {
                console.log(`ℹ️ Table ${tableName} access blocked by RLS (expected)`);
                return null;
            }
            throw new Error(`Query failed: ${error.message}`);
        }
        return data;
    }

    // Security testing utilities
    generateXSSPayloads() {
        return [
            '<script>alert("xss")</script>',
            '<img src="x" onerror="alert(1)">',
            'javascript:alert(1)',
            'data:text/html,<script>alert(1)</script>',
            'vbscript:msgbox("xss")',
            '<svg onload="alert(1)">',
            '"><script>alert(1)</script>',
            "'; DROP TABLE cards; --"
        ];
    }

    generateLongString(length) {
        return 'A'.repeat(length);
    }

    // Report generation
    generateReport() {
        const passed = this.testResults.filter(r => r.status === 'passed').length;
        const failed = this.testResults.filter(r => r.status === 'failed').length;
        const total = this.testResults.length;

        const report = {
            summary: {
                total,
                passed,
                failed,
                success_rate: total > 0 ? Math.round((passed / total) * 100) : 0
            },
            results: this.testResults
        };

        console.log('\n📊 Test Report:', report);
        
        // Display in UI if available
        const reportElement = document.getElementById('test-summary');
        if (reportElement) {
            reportElement.innerHTML = `
                <h3>Test Summary</h3>
                <p>Total: ${total} | Passed: ${passed} | Failed: ${failed}</p>
                <p>Success Rate: ${report.summary.success_rate}%</p>
            `;
        }

        return report;
    }
}

// Global test instance
window.testConfig = new TestConfig();

// Common CSS for test results
const testStyles = `
<style>
    .test-container {
        font-family: monospace;
        max-width: 800px;
        margin: 20px auto;
        padding: 20px;
        border: 1px solid #ddd;
        border-radius: 8px;
    }
    .test-result {
        padding: 8px;
        margin: 4px 0;
        border-radius: 4px;
        font-family: monospace;
    }
    .test-result.passed {
        background-color: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
    }
    .test-result.failed {
        background-color: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
    }
    .test-summary {
        background-color: #e2e3e5;
        padding: 15px;
        border-radius: 5px;
        margin: 20px 0;
    }
    .test-controls {
        margin: 20px 0;
    }
    .test-controls button {
        padding: 10px 20px;
        margin: 5px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    .test-controls button.primary {
        background-color: #007bff;
        color: white;
    }
    .test-controls button.danger {
        background-color: #dc3545;
        color: white;
    }
    .loading {
        color: #6c757d;
        font-style: italic;
    }
</style>
`;

// Inject styles into document head
document.head.insertAdjacentHTML('beforeend', testStyles);