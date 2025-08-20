const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

// Test advanced error handling
async function testErrorHandling() {
  console.log('\n=== Testing Advanced Error Handling ===');
  
  // Test 1: Invalid authentication
  console.log('\n1. Testing authentication error handling...');
  try {
    await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen3-coder-plus',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    }, {
      headers: { 'Authorization': 'Bearer invalid-token' }
    });
    console.log('❌ Authentication error test failed - should have thrown error');
  } catch (error) {
    const errorData = error.response?.data?.error;
    if (errorData) {
      console.log('✅ Authentication error properly handled');
      console.log(`  Error type: ${errorData.type}`);
      console.log(`  Error message: ${errorData.message}`);
      
      if (errorData.type === 'authentication_error') {
        console.log('✅ Correct error type for authentication failure');
      }
    } else {
      console.log('❌ No structured error response');
    }
  }

  // Test 2: Invalid model
  console.log('\n2. Testing invalid model error...');
  try {
    await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'nonexistent-model',
      messages: [
        { role: 'user', content: 'Hello' }
      ]
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    console.log('❌ Invalid model error test failed - should have thrown error');
  } catch (error) {
    const errorData = error.response?.data?.error;
    if (errorData) {
      console.log('✅ Invalid model error handled');
      console.log(`  Error type: ${errorData.type}`);
      console.log(`  Error message: ${errorData.message}`);
    } else {
      console.log('❌ No structured error response for invalid model');
    }
  }

  // Test 3: Invalid request format
  console.log('\n3. Testing invalid request format...');
  try {
    await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen3-coder-plus',
      // Missing required messages field
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    console.log('❌ Invalid request format test failed - should have thrown error');
  } catch (error) {
    const errorData = error.response?.data?.error;
    if (errorData) {
      console.log('✅ Invalid request format error handled');
      console.log(`  Error type: ${errorData.type}`);
      console.log(`  Error message: ${errorData.message}`);
      
      if (errorData.type === 'invalid_request_error') {
        console.log('✅ Correct error type for invalid request');
      }
    } else {
      console.log('❌ No structured error response for invalid request');
    }
  }

  // Test 4: Context length exceeded simulation
  console.log('\n4. Testing context length error handling...');
  try {
    const largeContent = 'x'.repeat(200000); // Very large content
    await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen3-coder-plus',
      messages: [
        { role: 'user', content: largeContent }
      ]
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    console.log('ℹ️  Large content request succeeded (may have been truncated by Qwen API)');
  } catch (error) {
    const errorData = error.response?.data?.error;
    if (errorData) {
      console.log('✅ Large content error handled');
      console.log(`  Error type: ${errorData.type}`);
      console.log(`  Error message: ${errorData.message}`);
      
      if (errorData.type === 'context_length_exceeded' || errorData.message.includes('context')) {
        console.log('✅ Context length error properly categorized');
      }
    } else {
      console.log('❌ No structured error response for large content');
    }
  }

  // Test 5: Invalid multimodal content
  console.log('\n5. Testing invalid multimodal content error...');
  try {
    await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen-vl-plus',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Test' },
            { 
              type: 'image_url', 
              image_url: { 
                url: 'invalid-url-format'
              }
            }
          ]
        }
      ]
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    console.log('❌ Invalid multimodal content test failed - should have thrown error');
  } catch (error) {
    const errorData = error.response?.data?.error;
    if (errorData && errorData.message.includes('Image URL must be')) {
      console.log('✅ Invalid multimodal content error handled properly');
      console.log(`  Error message: ${errorData.message}`);
    } else {
      console.log('❌ Multimodal validation error not properly handled');
      console.log(`  Actual error: ${errorData?.message || error.message}`);
    }
  }

  // Test 6: Test error code preservation
  console.log('\n6. Testing error code preservation...');
  try {
    // This should trigger some kind of Qwen API error
    await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen3-coder-plus',
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      max_tokens: -1 // Invalid parameter
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    console.log('ℹ️  Invalid parameter request succeeded (may be normalized by proxy)');
  } catch (error) {
    const errorData = error.response?.data?.error;
    if (errorData) {
      console.log('✅ Parameter validation error handled');
      console.log(`  Error type: ${errorData.type}`);
      console.log(`  Error message: ${errorData.message}`);
      
      if (errorData.code) {
        console.log(`  Error code: ${errorData.code}`);
        console.log('✅ Error code preserved from Qwen API');
      }
    }
  }
}

if (require.main === module) {
  testErrorHandling().catch(console.error);
}

module.exports = { testErrorHandling };