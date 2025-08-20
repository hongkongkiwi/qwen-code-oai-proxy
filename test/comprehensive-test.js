#!/usr/bin/env node

const { testMultimodalSupport } = require('./multimodal-test');
const { testModelsEndpoint } = require('./models-test');
const { testStreamingEnhancements } = require('./streaming-test');
const { testRateLimitHeaders } = require('./rate-limit-test');
const { testErrorHandling } = require('./error-handling-test');

// Comprehensive test runner for all new features
async function runAllTests() {
  console.log('🧪 Starting Comprehensive Test Suite for Qwen OAuth API Features');
  console.log('================================================================');
  
  const testResults = {
    passed: 0,
    failed: 0,
    total: 5
  };
  
  try {
    // Test 1: Multimodal Support
    console.log('\n📸 Running Multimodal Support Tests...');
    await testMultimodalSupport();
    testResults.passed++;
    console.log('✅ Multimodal tests completed');
  } catch (error) {
    console.error('❌ Multimodal tests failed:', error.message);
    testResults.failed++;
  }
  
  try {
    // Test 2: Dynamic Models Endpoint
    console.log('\n📋 Running Models Endpoint Tests...');
    await testModelsEndpoint();
    testResults.passed++;
    console.log('✅ Models endpoint tests completed');
  } catch (error) {
    console.error('❌ Models endpoint tests failed:', error.message);
    testResults.failed++;
  }
  
  try {
    // Test 3: Enhanced Streaming
    console.log('\n🌊 Running Enhanced Streaming Tests...');
    await testStreamingEnhancements();
    testResults.passed++;
    console.log('✅ Enhanced streaming tests completed');
  } catch (error) {
    console.error('❌ Enhanced streaming tests failed:', error.message);
    testResults.failed++;
  }
  
  try {
    // Test 4: Rate Limit Headers
    console.log('\n⚡ Running Rate Limit Headers Tests...');
    await testRateLimitHeaders();
    testResults.passed++;
    console.log('✅ Rate limit headers tests completed');
  } catch (error) {
    console.error('❌ Rate limit headers tests failed:', error.message);
    testResults.failed++;
  }
  
  try {
    // Test 5: Advanced Error Handling
    console.log('\n🚨 Running Advanced Error Handling Tests...');
    await testErrorHandling();
    testResults.passed++;
    console.log('✅ Advanced error handling tests completed');
  } catch (error) {
    console.error('❌ Advanced error handling tests failed:', error.message);
    testResults.failed++;
  }
  
  // Summary
  console.log('\n================================================================');
  console.log('🏁 Test Suite Complete');
  console.log('================================================================');
  console.log(`📊 Results: ${testResults.passed}/${testResults.total} test suites passed`);
  
  if (testResults.failed > 0) {
    console.log(`❌ ${testResults.failed} test suite(s) had failures`);
    console.log('\nNote: Individual test failures within suites may be expected if:');
    console.log('- The Qwen API doesn\'t support certain features yet');
    console.log('- Network connectivity issues');
    console.log('- Authentication not configured');
    console.log('\nCheck individual test outputs above for details.');
  } else {
    console.log('🎉 All test suites completed successfully!');
  }
  
  console.log('\n📝 Features Tested:');
  console.log('  ✓ Multimodal input support (image/video URLs)');
  console.log('  ✓ Dynamic model listing with enhanced metadata');
  console.log('  ✓ Enhanced streaming with custom options');
  console.log('  ✓ Rate limit headers pass-through');
  console.log('  ✓ Advanced error handling and mapping');
  
  console.log('\n🔧 To run individual test suites:');
  console.log('  node test/multimodal-test.js');
  console.log('  node test/models-test.js');
  console.log('  node test/streaming-test.js');
  console.log('  node test/rate-limit-test.js');
  console.log('  node test/error-handling-test.js');
  
  // Exit with appropriate code
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Helper function to check if server is running
async function checkServerHealth() {
  const axios = require('axios');
  try {
    await axios.get('http://localhost:8080/health', { timeout: 5000 });
    return true;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  console.log('🔍 Checking if Qwen proxy server is running...');
  
  const serverRunning = await checkServerHealth();
  if (!serverRunning) {
    console.error('❌ Qwen proxy server is not running on http://localhost:8080');
    console.error('Please start the server with: npm start');
    process.exit(1);
  }
  
  console.log('✅ Server is running, proceeding with tests...');
  await runAllTests();
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  });
}

module.exports = { runAllTests };