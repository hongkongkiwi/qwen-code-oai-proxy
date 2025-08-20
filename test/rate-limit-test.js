const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

// Test rate limit headers pass-through
async function testRateLimitHeaders() {
  console.log('\n=== Testing Rate Limit Headers ===');
  
  // Test 1: Check for rate limit headers in regular requests
  console.log('\n1. Testing rate limit headers in chat completions...');
  try {
    const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen3-coder-plus',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    
    const rateLimitHeaders = {};
    const headerKeys = [
      'x-ratelimit-limit',
      'x-ratelimit-remaining', 
      'x-ratelimit-reset',
      'x-ratelimit-limit-requests',
      'x-ratelimit-limit-tokens',
      'x-ratelimit-remaining-requests',
      'x-ratelimit-remaining-tokens',
      'retry-after'
    ];
    
    headerKeys.forEach(key => {
      if (response.headers[key] || response.headers[key.toLowerCase()]) {
        rateLimitHeaders[key] = response.headers[key] || response.headers[key.toLowerCase()];
      }
    });
    
    if (Object.keys(rateLimitHeaders).length > 0) {
      console.log('✅ Rate limit headers found in response:');
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    } else {
      console.log('ℹ️  No rate limit headers in response (may be normal if Qwen API doesn\'t send them)');
    }
    
  } catch (error) {
    console.log('❌ Rate limit headers test failed:', error.response?.data?.error?.message || error.message);
  }

  // Test 2: Check rate limit headers in models endpoint
  console.log('\n2. Testing rate limit headers in models endpoint...');
  try {
    const response = await axios.get(`${BASE_URL}/v1/models`, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    
    const rateLimitHeaders = {};
    const headerKeys = [
      'x-ratelimit-limit',
      'x-ratelimit-remaining', 
      'x-ratelimit-reset'
    ];
    
    headerKeys.forEach(key => {
      if (response.headers[key] || response.headers[key.toLowerCase()]) {
        rateLimitHeaders[key] = response.headers[key] || response.headers[key.toLowerCase()];
      }
    });
    
    if (Object.keys(rateLimitHeaders).length > 0) {
      console.log('✅ Rate limit headers found in models response:');
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    } else {
      console.log('ℹ️  No rate limit headers in models response');
    }
    
  } catch (error) {
    console.log('❌ Models rate limit headers test failed:', error.response?.data?.error?.message || error.message);
  }

  // Test 3: Make multiple requests to potentially trigger rate limits
  console.log('\n3. Testing multiple requests to observe rate limiting behavior...');
  const requests = [];
  for (let i = 0; i < 5; i++) {
    requests.push(
      axios.post(`${BASE_URL}/v1/chat/completions`, {
        model: 'qwen3-coder-plus',
        messages: [
          { role: 'user', content: `Test message ${i + 1}` }
        ]
      }, {
        headers: { 'Authorization': 'Bearer test-key' }
      }).catch(error => ({ error, index: i }))
    );
  }
  
  try {
    const responses = await Promise.all(requests);
    
    let successCount = 0;
    let rateLimitCount = 0;
    
    responses.forEach((response, index) => {
      if (response.error) {
        if (response.error.response?.status === 429) {
          rateLimitCount++;
          console.log(`Request ${index + 1}: Rate limited`);
          
          // Check for Retry-After header
          const retryAfter = response.error.response.headers['retry-after'];
          if (retryAfter) {
            console.log(`  Retry-After: ${retryAfter} seconds`);
          }
        } else {
          console.log(`Request ${index + 1}: Error -`, response.error.response?.data?.error?.message || response.error.message);
        }
      } else {
        successCount++;
        
        // Check rate limit headers on successful requests
        const remaining = response.headers['x-ratelimit-remaining'] || response.headers['x-ratelimit-remaining-requests'];
        if (remaining) {
          console.log(`Request ${index + 1}: Success (${remaining} remaining)`);
        } else {
          console.log(`Request ${index + 1}: Success`);
        }
      }
    });
    
    console.log(`✅ Completed batch test: ${successCount} successful, ${rateLimitCount} rate limited`);
    
  } catch (error) {
    console.log('❌ Batch request test failed:', error.message);
  }
}

if (require.main === module) {
  testRateLimitHeaders().catch(console.error);
}

module.exports = { testRateLimitHeaders };