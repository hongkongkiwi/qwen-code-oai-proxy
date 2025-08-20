const axios = require('axios');

const BASE_URL = 'http://localhost:8080';

// Test multimodal input support
async function testMultimodalSupport() {
  console.log('\n=== Testing Multimodal Support ===');
  
  // Test 1: Image input with data URL
  console.log('\n1. Testing image input with data URL...');
  try {
    const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen-vl-plus',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What do you see in this image?' },
            { 
              type: 'image_url', 
              image_url: { 
                url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...',
                detail: 'high'
              }
            }
          ]
        }
      ]
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    console.log('✅ Image input test passed');
  } catch (error) {
    console.log('❌ Image input test failed:', error.response?.data?.error?.message || error.message);
  }

  // Test 2: Video input with HTTP URL
  console.log('\n2. Testing video input with HTTP URL...');
  try {
    const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      model: 'qwen-vl-max',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this video' },
            { 
              type: 'video_url', 
              video_url: { 
                url: 'https://example.com/video.mp4'
              }
            }
          ]
        }
      ]
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    console.log('✅ Video input test passed');
  } catch (error) {
    console.log('❌ Video input test failed:', error.response?.data?.error?.message || error.message);
  }

  // Test 3: Invalid image URL
  console.log('\n3. Testing invalid image URL validation...');
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
                url: 'invalid://url'
              }
            }
          ]
        }
      ]
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    console.log('❌ Invalid URL validation failed - should have thrown error');
  } catch (error) {
    if (error.response?.data?.error?.message?.includes('Image URL must be')) {
      console.log('✅ Invalid URL validation test passed');
    } else {
      console.log('❌ Wrong error for invalid URL:', error.response?.data?.error?.message || error.message);
    }
  }

  // Test 4: Missing image URL
  console.log('\n4. Testing missing image URL validation...');
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
              image_url: {}
            }
          ]
        }
      ]
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    console.log('❌ Missing URL validation failed - should have thrown error');
  } catch (error) {
    if (error.response?.data?.error?.message?.includes('Image URL is required')) {
      console.log('✅ Missing URL validation test passed');
    } else {
      console.log('❌ Wrong error for missing URL:', error.response?.data?.error?.message || error.message);
    }
  }

  // Test 5: Invalid image detail level
  console.log('\n5. Testing invalid image detail validation...');
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
                url: 'https://example.com/image.jpg',
                detail: 'invalid'
              }
            }
          ]
        }
      ]
    }, {
      headers: { 'Authorization': 'Bearer test-key' }
    });
    console.log('❌ Invalid detail validation failed - should have thrown error');
  } catch (error) {
    if (error.response?.data?.error?.message?.includes('Image detail must be')) {
      console.log('✅ Invalid detail validation test passed');
    } else {
      console.log('❌ Wrong error for invalid detail:', error.response?.data?.error?.message || error.message);
    }
  }
}

if (require.main === module) {
  testMultimodalSupport().catch(console.error);
}

module.exports = { testMultimodalSupport };