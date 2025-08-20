const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

// Test dynamic models endpoint
async function testModelsEndpoint() {
  console.log('\n=== Testing Models Endpoint ===');
  
  // Test 1: Get models list
  console.log('\n1. Testing models list endpoint...');
  try {
    const response = await axios.get(`${BASE_URL}/v1/models`, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    
    const data = response.data;
    
    // Validate response structure
    if (data.object === 'list' && Array.isArray(data.data)) {
      console.log('✅ Models endpoint response structure is valid');
      
      // Check for enhanced models
      const hasEnhancedModels = data.data.some(model => 
        model.capabilities || model.context_length
      );
      
      if (hasEnhancedModels) {
        console.log('✅ Enhanced model metadata found');
      } else {
        console.log('ℹ️  Basic model list returned');
      }
      
      // Check for multimodal models
      const hasMultimodalModels = data.data.some(model => 
        model.id.includes('vl') || (model.capabilities && model.capabilities.includes('video'))
      );
      
      if (hasMultimodalModels) {
        console.log('✅ Multimodal models included in list');
      }
      
      console.log(`ℹ️  Found ${data.data.length} models total`);
      
      // Show sample models
      console.log('Sample models:');
      data.data.slice(0, 3).forEach(model => {
        console.log(`  - ${model.id} (${model.owned_by})`);
        if (model.capabilities) {
          console.log(`    Capabilities: ${model.capabilities.join(', ')}`);
        }
        if (model.context_length) {
          console.log(`    Context length: ${model.context_length}`);
        }
      });
      
    } else {
      console.log('❌ Invalid models endpoint response structure');
    }
    
  } catch (error) {
    console.log('❌ Models endpoint test failed:', error.response?.data?.error?.message || error.message);
  }
  
  // Test 2: Test without authentication (if API key is configured)
  console.log('\n2. Testing models endpoint without auth...');
  try {
    const response = await axios.get(`${BASE_URL}/v1/models`);
    console.log('✅ Models endpoint works without auth (or no API key configured)');
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Models endpoint properly requires authentication');
    } else {
      console.log('❌ Unexpected error:', error.response?.data?.error?.message || error.message);
    }
  }
}

if (require.main === module) {
  testModelsEndpoint().catch(console.error);
}

module.exports = { testModelsEndpoint };