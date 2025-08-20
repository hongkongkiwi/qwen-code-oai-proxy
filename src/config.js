// src/config.js
require('dotenv').config();

module.exports = {
  // Server configuration
  port: parseInt(process.env.PORT) || 8080,
  host: process.env.HOST || 'localhost',
  
  // Streaming configuration
  stream: process.env.STREAM === 'true', // Disable streaming by default, enable only if STREAM=true
  
  // Qwen OAuth configuration
  qwen: {
    clientId: process.env.QWEN_CLIENT_ID || 'f0304373b74a44d2b584a3fb70ca9e56',
    clientSecret: process.env.QWEN_CLIENT_SECRET || '',
    baseUrl: process.env.QWEN_BASE_URL || 'https://chat.qwen.ai',
    deviceCodeEndpoint: process.env.QWEN_DEVICE_CODE_ENDPOINT || 'https://chat.qwen.ai/api/v1/oauth2/device/code',
    tokenEndpoint: process.env.QWEN_TOKEN_ENDPOINT || 'https://chat.qwen.ai/api/v1/oauth2/token',
    scope: process.env.QWEN_SCOPE || 'openid profile email model.completion'
  },
  
  // Default model
  defaultModel: process.env.DEFAULT_MODEL || 'qwen3-coder-plus',
  
  // Token refresh buffer (milliseconds)
  tokenRefreshBuffer: parseInt(process.env.TOKEN_REFRESH_BUFFER) || 30000, // 30 seconds
  
  // Default account to use first (if available)
  defaultAccount: process.env.DEFAULT_ACCOUNT || '',
  
  // API key authentication
  apiKey: process.env.FAKE_API_KEY || '',
  
  // Debug logging configuration
  debugLog: process.env.DEBUG_LOG === 'true' ? true : false, // Enable/disable debug logging (disabled by default)
  logFileLimit: parseInt(process.env.LOG_FILE_LIMIT) || 20 // Maximum number of log files to keep
};