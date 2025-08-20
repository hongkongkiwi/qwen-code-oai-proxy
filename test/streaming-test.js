const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

// Test enhanced streaming functionality
async function testStreamingEnhancements() {
  console.log('\n=== Testing Enhanced Streaming ===');
  
  // Test 1: Basic streaming with enhanced options
  console.log('\n1. Testing basic streaming with custom options...');
  try {
    const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen3-coder-plus',
      messages: [
        { role: 'user', content: 'Write a simple hello world function' }
      ],
      stream: true,
      stream_options: {
        include_usage: true,
        metadata: true
      }
    }, {
      headers: { 
        'Authorization': 'Bearer test-key',
        'Accept': 'text/event-stream'
      },
      responseType: 'stream'
    });
    
    console.log('✅ Streaming request initiated successfully');
    
    let chunks = 0;
    let hasUsage = false;
    let hasMetadata = false;
    
    response.data.on('data', (chunk) => {
      chunks++;
      const lines = chunk.toString().split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.usage) {
              hasUsage = true;
            }
            if (data.metadata) {
              hasMetadata = true;
            }
          } catch (e) {
            // Ignore parse errors for partial chunks
          }
        }
      }
    });
    
    await new Promise((resolve) => {
      response.data.on('end', () => {
        console.log(`✅ Received ${chunks} chunks`);
        if (hasUsage) {
          console.log('✅ Usage information included in stream');
        }
        resolve();
      });
    });
    
  } catch (error) {
    console.log('❌ Enhanced streaming test failed:', error.response?.data?.error?.message || error.message);
  }

  // Test 2: Streaming with multimodal content
  console.log('\n2. Testing streaming with multimodal content...');
  try {
    const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen-vl-plus',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image' },
            { 
              type: 'image_url', 
              image_url: { 
                url: 'https://example.com/test.jpg'
              }
            }
          ]
        }
      ],
      stream: true,
      stream_options: {
        include_usage: true
      }
    }, {
      headers: { 
        'Authorization': 'Bearer test-key',
        'Accept': 'text/event-stream'
      },
      responseType: 'stream'
    });
    
    console.log('✅ Multimodal streaming request initiated successfully');
    
  } catch (error) {
    console.log('❌ Multimodal streaming test failed:', error.response?.data?.error?.message || error.message);
  }

  // Test 3: Test streaming without stream_options (backward compatibility)
  console.log('\n3. Testing backward compatibility - streaming without stream_options...');
  try {
    const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen3-coder-plus',
      messages: [
        { role: 'user', content: 'Count to 3' }
      ],
      stream: true
    }, {
      headers: { 
        'Authorization': 'Bearer test-key',
        'Accept': 'text/event-stream'
      },
      responseType: 'stream'
    });
    
    console.log('✅ Backward compatible streaming works');
    
  } catch (error) {
    console.log('❌ Backward compatibility test failed:', error.response?.data?.error?.message || error.message);
  }
}

if (require.main === module) {
  testStreamingEnhancements().catch(console.error);
}

module.exports = { testStreamingEnhancements };