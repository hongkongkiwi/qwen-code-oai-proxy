const axios = require('axios');
const { QwenAuthManager } = require('./auth.js');
const { PassThrough } = require('stream');
const path = require('path');
const { promises: fs } = require('fs');

// Default Qwen configuration
const DEFAULT_QWEN_API_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_MODEL = 'qwen3-coder-plus';

// List of known Qwen models
const QWEN_MODELS = [
  {
    id: 'qwen3-coder-plus',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  },
  {
    id: 'qwen3-coder-turbo',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  },
  {
    id: 'qwen3-plus',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  },
  {
    id: 'qwen3-turbo',
    object: 'model',
    created: 1754686206,
    owned_by: 'qwen'
  }
];

/**
 * Check if an error is related to authentication/authorization
 */
function isAuthError(error) {
  if (!error) return false;

  const errorMessage = 
    error instanceof Error 
      ? error.message.toLowerCase() 
      : String(error).toLowerCase();

  // Define a type for errors that might have status or code properties
  const errorWithCode = error;
  const errorCode = errorWithCode?.response?.status || errorWithCode?.code;

  return (
    errorCode === 400 ||
    errorCode === 401 ||
    errorCode === 403 ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('forbidden') ||
    errorMessage.includes('invalid api key') ||
    errorMessage.includes('invalid access token') ||
    errorMessage.includes('token expired') ||
    errorMessage.includes('authentication') ||
    errorMessage.includes('access denied') ||
    (errorMessage.includes('token') && errorMessage.includes('expired')) ||
    // Also check for 504 errors which might be related to auth issues
    errorCode === 504 ||
    errorMessage.includes('504') ||
    errorMessage.includes('gateway timeout')
  );
}

/**
 * Check if an error is related to quota limits
 */
function isQuotaExceededError(error) {
  if (!error) return false;

  const errorMessage = 
    error instanceof Error 
      ? error.message.toLowerCase() 
      : String(error).toLowerCase();

  // Define a type for errors that might have status or code properties
  const errorWithCode = error;
  const errorCode = errorWithCode?.response?.status || errorWithCode?.code;

  return (
    errorMessage.includes('insufficient_quota') ||
    errorMessage.includes('free allocated quota exceeded') ||
    (errorMessage.includes('quota') && errorMessage.includes('exceeded')) ||
    errorCode === 429
  );
}

class QwenAPI {
  constructor() {
    this.authManager = new QwenAuthManager();
    this.requestCount = new Map(); // Track requests per account
    this.authErrorCount = new Map(); // Track consecutive auth errors per account
    this.lastResetDate = new Date().toISOString().split('T')[0]; // Track last reset date (UTC)
    this.requestCountFile = path.join(this.authManager.qwenDir, 'request_counts.json');
    this.loadRequestCounts();
    this.rateLimitInfo = {
      requestsPerMinute: 60,
      requestsPerDay: 2000
    };
  }

  /**
   * Load request counts from disk
   */
  async loadRequestCounts() {
    try {
      const data = await fs.readFile(this.requestCountFile, 'utf8');
      const counts = JSON.parse(data);
      
      // Restore last reset date
      if (counts.lastResetDate) {
        this.lastResetDate = counts.lastResetDate;
      }
      
      // Restore request counts
      if (counts.requests) {
        for (const [accountId, count] of Object.entries(counts.requests)) {
          this.requestCount.set(accountId, count);
        }
      }
      
      // Reset counts if we've crossed into a new UTC day
      this.resetRequestCountsIfNeeded();
    } catch (error) {
      // File doesn't exist or is invalid, start with empty counts
      this.resetRequestCountsIfNeeded();
    }
  }

  /**
   * Save request counts to disk
   */
  async saveRequestCounts() {
    try {
      const counts = {
        lastResetDate: this.lastResetDate,
        requests: Object.fromEntries(this.requestCount)
      };
      await fs.writeFile(this.requestCountFile, JSON.stringify(counts, null, 2));
    } catch (error) {
      console.warn('Failed to save request counts:', error.message);
    }
  }

  /**
   * Reset request counts if we've crossed into a new UTC day
   */
  resetRequestCountsIfNeeded() {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.requestCount.clear();
      this.lastResetDate = today;
      console.log('Request counts reset for new UTC day');
      this.saveRequestCounts();
    }
  }

  /**
   * Increment request count for an account
   * @param {string} accountId - The account ID
   */
  async incrementRequestCount(accountId) {
    this.resetRequestCountsIfNeeded();
    const currentCount = this.requestCount.get(accountId) || 0;
    this.requestCount.set(accountId, currentCount + 1);
    await this.saveRequestCounts();
  }

  /**
   * Get request count for an account
   * @param {string} accountId - The account ID
   * @returns {number} The request count
   */
  getRequestCount(accountId) {
    this.resetRequestCountsIfNeeded();
    return this.requestCount.get(accountId) || 0;
  }

  /**
   * Increment auth error count for an account
   * @param {string} accountId - The account ID
   */
  incrementAuthErrorCount(accountId) {
    const currentCount = this.authErrorCount.get(accountId) || 0;
    this.authErrorCount.set(accountId, currentCount + 1);
    return currentCount + 1;
  }

  /**
   * Reset auth error count for an account (when a successful request is made)
   * @param {string} accountId - The account ID
   */
  resetAuthErrorCount(accountId) {
    this.authErrorCount.set(accountId, 0);
  }

  /**
   * Get auth error count for an account
   * @param {string} accountId - The account ID
   * @returns {number} The auth error count
   */
  getAuthErrorCount(accountId) {
    return this.authErrorCount.get(accountId) || 0;
  }

  /**
   * Validate multimodal content in messages
   * @param {Array} messages - The messages array
   */
  validateMultimodalContent(messages) {
    if (!messages || !Array.isArray(messages)) {
      return;
    }

    for (const message of messages) {
      if (message.content && Array.isArray(message.content)) {
        for (const content of message.content) {
          if (content.type === 'image_url' && content.image_url) {
            this.validateImageContent(content.image_url);
          } else if (content.type === 'video_url' && content.video_url) {
            this.validateVideoContent(content.video_url);
          }
        }
      }
    }
  }

  /**
   * Validate image content
   * @param {Object} imageUrl - The image_url object
   */
  validateImageContent(imageUrl) {
    if (!imageUrl.url) {
      throw new Error('Image URL is required for image content');
    }
    
    // Support data URLs and HTTP/HTTPS URLs
    const isDataUrl = imageUrl.url.startsWith('data:');
    const isHttpUrl = imageUrl.url.startsWith('http://') || imageUrl.url.startsWith('https://');
    
    if (!isDataUrl && !isHttpUrl) {
      throw new Error('Image URL must be a data URL or HTTP/HTTPS URL');
    }

    // Validate detail level if provided
    if (imageUrl.detail && !['low', 'high', 'auto'].includes(imageUrl.detail)) {
      throw new Error('Image detail must be "low", "high", or "auto"');
    }
  }

  /**
   * Validate video content
   * @param {Object} videoUrl - The video_url object
   */
  validateVideoContent(videoUrl) {
    if (!videoUrl.url) {
      throw new Error('Video URL is required for video content');
    }
    
    // Support data URLs and HTTP/HTTPS URLs
    const isDataUrl = videoUrl.url.startsWith('data:');
    const isHttpUrl = videoUrl.url.startsWith('http://') || videoUrl.url.startsWith('https://');
    
    if (!isDataUrl && !isHttpUrl) {
      throw new Error('Video URL must be a data URL or HTTP/HTTPS URL');
    }
  }

  /**
   * Extract rate limit headers from Qwen API response and pass them through
   * @param {Object} responseHeaders - The response headers from Qwen API
   * @returns {Object} Rate limit headers to pass through
   */
  extractRateLimitHeaders(responseHeaders) {
    const rateLimitHeaders = {};
    
    // Common rate limit header patterns to look for
    const headerMappings = {
      'x-ratelimit-limit': 'X-RateLimit-Limit',
      'x-ratelimit-remaining': 'X-RateLimit-Remaining', 
      'x-ratelimit-reset': 'X-RateLimit-Reset',
      'x-ratelimit-limit-requests': 'X-RateLimit-Limit-Requests',
      'x-ratelimit-limit-tokens': 'X-RateLimit-Limit-Tokens',
      'x-ratelimit-remaining-requests': 'X-RateLimit-Remaining-Requests',
      'x-ratelimit-remaining-tokens': 'X-RateLimit-Remaining-Tokens',
      'x-ratelimit-reset-requests': 'X-RateLimit-Reset-Requests',
      'x-ratelimit-reset-tokens': 'X-RateLimit-Reset-Tokens',
      'retry-after': 'Retry-After'
    };
    
    // Extract and normalize rate limit headers
    if (responseHeaders) {
      Object.entries(headerMappings).forEach(([qwenHeader, standardHeader]) => {
        const value = responseHeaders[qwenHeader] || responseHeaders[qwenHeader.toLowerCase()];
        if (value !== undefined) {
          rateLimitHeaders[standardHeader] = value;
        }
      });
    }
    
    return rateLimitHeaders;
  }

  /**
   * Handle Qwen-specific errors with enhanced error mapping
   * @param {Error} error - The error to handle
   * @returns {Object} Enhanced error information
   */
  handleQwenError(error) {
    const errorResponse = {
      error: {
        message: error.message,
        type: 'api_error',
        code: null
      }
    };

    // Map Qwen-specific error codes and messages
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 400:
          errorResponse.error.type = 'invalid_request_error';
          if (data && data.error && data.error.message) {
            errorResponse.error.message = data.error.message;
            errorResponse.error.code = data.error.code;
          }
          break;
        case 401:
          errorResponse.error.type = 'authentication_error';
          errorResponse.error.message = 'Invalid authentication credentials';
          break;
        case 403:
          errorResponse.error.type = 'permission_error';
          errorResponse.error.message = 'Insufficient permissions for this request';
          break;
        case 429:
          errorResponse.error.type = 'rate_limit_exceeded';
          errorResponse.error.message = 'Rate limit exceeded. Please try again later';
          break;
        case 500:
        case 502:
        case 503:
          errorResponse.error.type = 'api_error';
          errorResponse.error.message = 'Qwen API service temporarily unavailable';
          break;
        case 504:
          errorResponse.error.type = 'timeout_error';
          errorResponse.error.message = 'Request timeout. Please try with smaller context or retry later';
          break;
        default:
          errorResponse.error.type = 'api_error';
          errorResponse.error.message = `Qwen API error: ${status}`;
      }
      
      // Handle specific Qwen error messages
      if (data && data.error) {
        if (data.error.message && data.error.message.includes('insufficient_quota')) {
          errorResponse.error.type = 'quota_exceeded';
          errorResponse.error.message = 'Daily quota exceeded for this account';
        }
        
        if (data.error.message && data.error.message.includes('context_length_exceeded')) {
          errorResponse.error.type = 'context_length_exceeded';
          errorResponse.error.message = 'Context length exceeds model limits. Try reducing input size';
        }
        
        if (data.error.message && data.error.message.includes('unsupported_media_type')) {
          errorResponse.error.type = 'unsupported_media_type';
          errorResponse.error.message = 'Unsupported media type in multimodal content';
        }
      }
    }

    return errorResponse;
  }

  async getApiEndpoint(credentials) {
    // Check if credentials contain a custom endpoint
    if (credentials && credentials.resource_url) {
      let endpoint = credentials.resource_url;
      // Ensure it has a scheme
      if (!endpoint.startsWith('http')) {
        endpoint = `https://${endpoint}`;
      }
      // Ensure it has the /v1 suffix
      if (!endpoint.endsWith('/v1')) {
        if (endpoint.endsWith('/')) {
          endpoint += 'v1';
        } else {
          endpoint += '/v1';
        }
      }
      return endpoint;
    } else {
      // Use default endpoint
      return DEFAULT_QWEN_API_BASE_URL;
    }
  }

  async chatCompletions(request) {
    // Validate multimodal content
    this.validateMultimodalContent(request.messages);
    
    // Load all accounts for multi-account support
    await this.authManager.loadAllAccounts();
    const accountIds = this.authManager.getAccountIds();
    
    // If no additional accounts, use default behavior
    if (accountIds.length === 0) {
      return this.chatCompletionsSingleAccount(request);
    }
    
    // Start with the default account if specified, otherwise start with the first account
    let currentAccountIndex = 0;
    const defaultAccount = require('../config.js').defaultAccount;
    if (defaultAccount && accountIds.includes(defaultAccount)) {
      currentAccountIndex = accountIds.indexOf(defaultAccount);
      console.log(`\x1b[36mUsing default account: ${defaultAccount}\x1b[0m`);
    }
    let lastError = null;
    const maxRetries = accountIds.length;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Get the current account (sticky until quota error)
        const accountId = accountIds[currentAccountIndex];
        const credentials = this.authManager.getAccountCredentials(accountId);
        
        if (!credentials) {
          // Move to next account if current one is invalid
          currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
          continue;
        }
        
        // Show which account we're using
        console.log(`\x1b[36mUsing account ${accountId} (Request #${this.getRequestCount(accountId) + 1} today)\x1b[0m`);
        
        // Get a valid access token for this account
        const accessToken = await this.authManager.getValidAccessToken(accountId);
        
        // Get API endpoint
        const apiEndpoint = await this.getApiEndpoint(credentials);
        
        // Make API call
        const url = `${apiEndpoint}/chat/completions`;
        const payload = {
          model: request.model || DEFAULT_MODEL,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          top_p: request.top_p,
          tools: request.tools,
          tool_choice: request.tool_choice
        };
        
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
        };
        
        // Increment request count for this account
        await this.incrementRequestCount(accountId);
        console.log(`\x1b[36mUsing account ${accountId} (Request #${this.getRequestCount(accountId)} today)\x1b[0m`);
        
        const response = await axios.post(url, payload, { headers, timeout: 300000 }); // 5 minute timeout
        // Reset auth error count on successful request
        this.resetAuthErrorCount(accountId);
        
        // Attach rate limit headers from Qwen API response
        const rateLimitHeaders = this.extractRateLimitHeaders(response.headers);
        const result = response.data;
        result._rateLimitHeaders = rateLimitHeaders;
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if this is a quota exceeded error
        if (isQuotaExceededError(error)) {
          console.log(`\x1b[33mAccount ${accountId} quota exceeded (Request #${this.getRequestCount(accountId)}), rotating to next account...\\x1b[0m`);
          // Move to next account for the next request
          currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
          // Peek at the next account to show which one we're rotating to
          const nextAccountId = accountIds[currentAccountIndex];
          console.log(`\x1b[33mWill try account ${nextAccountId} next\\x1b[0m`);
          // Continue to next account
          continue;
        }
        
        // Check if this is an authentication error that might benefit from a retry
        if (isAuthError(error)) {
          // Increment auth error count for this account
          const authErrorCount = this.incrementAuthErrorCount(accountId);
          console.log(`\x1b[33mDetected auth error (${error.response?.status || 'N/A'}) for account ${accountId} (consecutive count: ${authErrorCount})\x1b[0m`);
          
          // If we've had 3 consecutive auth errors, rotate to next account
          if (authErrorCount >= 3) {
            console.log(`\x1b[33mAccount ${accountId} has had ${authErrorCount} consecutive auth errors, rotating to next account...\\x1b[0m`);
            // Move to next account for the next request
            currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
            // Peek at the next account to show which one we're rotating to
            const nextAccountId = accountIds[currentAccountIndex];
            console.log(`\x1b[33mWill try account ${nextAccountId} next\\x1b[0m`);
            // Continue to next account
            continue;
          }
          
          // Try token refresh for auth errors (less than 3 consecutive)
          console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh and retry...`);
          try {
            // Force refresh the token and retry once
            await this.authManager.performTokenRefresh(credentials, accountId);
            const newAccessToken = await this.authManager.getValidAccessToken(accountId);
            
            // Retry the request with the new token
            console.log('\x1b[36m%s\x1b[0m', 'Retrying request with refreshed token...');
            const retryHeaders = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newAccessToken}`,
              'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
            };
            
            const retryResponse = await axios.post(url, payload, { headers: retryHeaders, timeout: 300000 });
            console.log('\x1b[32m%s\x1b[0m', 'Request succeeded after token refresh');
            // Reset auth error count on successful request
            this.resetAuthErrorCount(accountId);
            return retryResponse.data;
          } catch (retryError) {
            console.error('\x1b[31m%s\x1b[0m', 'Request failed even after token refresh');
            // If retry fails, continue to next account
            continue;
          }
        }
        
        // For other errors, re-throw
        if (error.response) {
          // The request was made and the server responded with a status code
          throw new Error(`Qwen API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          // The request was made but no response was received
          throw new Error(`Qwen API request failed: No response received`);
        } else {
          // Something happened in setting up the request that triggered an Error
          throw new Error(`Qwen API request failed: ${error.message}`);
        }
      }
    }
    
    // If we get here, all accounts failed
    throw new Error(`All accounts failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  async chatCompletionsSingleAccount(request) {
    // Validate multimodal content
    this.validateMultimodalContent(request.messages);
    
    // Get a valid access token (automatically refreshes if needed)
    const accessToken = await this.authManager.getValidAccessToken();
    const credentials = await this.authManager.loadCredentials();
    const apiEndpoint = await this.getApiEndpoint(credentials);
    
    // Make API call
    const url = `${apiEndpoint}/chat/completions`;
    const payload = {
      model: request.model || DEFAULT_MODEL,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.max_tokens,
      top_p: request.top_p,
      tools: request.tools,
      tool_choice: request.tool_choice
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
    };
    
    try {
      const response = await axios.post(url, payload, { headers, timeout: 300000 }); // 5 minute timeout
      // Reset auth error count on successful request (for consistency, even though we don't rotate)
      this.resetAuthErrorCount('default');
      
      // Attach rate limit headers from Qwen API response
      const rateLimitHeaders = this.extractRateLimitHeaders(response.headers);
      const result = response.data;
      result._rateLimitHeaders = rateLimitHeaders;
      
      return result;
    } catch (error) {
      // Check if this is an authentication error that might benefit from a retry
      if (isAuthError(error)) {
        // Increment auth error count (for tracking, even though we can't rotate)
        const authErrorCount = this.incrementAuthErrorCount('default');
        console.log(`\x1b[33mDetected auth error (${error.response?.status || 'N/A'}) (consecutive count: ${authErrorCount})\x1b[0m`);
        
        console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh and retry...`);
        try {
          // Force refresh the token and retry once
          await this.authManager.performTokenRefresh(credentials);
          const newAccessToken = await this.authManager.getValidAccessToken();
          
          // Retry the request with the new token
          console.log('\x1b[36m%s\x1b[0m', 'Retrying request with refreshed token...');
          const retryHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${newAccessToken}`,
            'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
          };
          
          const retryResponse = await axios.post(url, payload, { headers: retryHeaders, timeout: 300000 });
          console.log('\x1b[32m%s\x1b[0m', 'Request succeeded after token refresh');
          // Reset auth error count on successful request
          this.resetAuthErrorCount('default');
          return retryResponse.data;
        } catch (retryError) {
          console.error('\x1b[31m%s\x1b[0m', 'Request failed even after token refresh');
          // If retry fails, throw the original error with additional context
          throw new Error(`Qwen API error (after token refresh attempt): ${error.response?.status || 'N/A'} ${JSON.stringify(error.response?.data || error.message)}`);
        }
      }
      
      if (error.response) {
        // The request was made and the server responded with a status code
        throw new Error(`Qwen API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error(`Qwen API request failed: No response received`);
      } else {
        // Something happened in setting up the request that triggered an Error
        throw new Error(`Qwen API request failed: ${error.message}`);
      }
    }
  }

  async listModels() {
    try {
      // Try to get dynamic model list from Qwen API
      const accessToken = await this.authManager.getValidAccessToken();
      const credentials = await this.authManager.loadCredentials();
      const apiEndpoint = await this.getApiEndpoint(credentials);
      
      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)'
      };
      
      try {
        // Try fetching from the models endpoint
        const response = await axios.get(`${apiEndpoint}/models`, { headers, timeout: 10000 });
        console.log('Fetched dynamic models list from Qwen API');
        return response.data;
      } catch (error) {
        // If models endpoint doesn't exist or fails, fall back to enhanced mock
        console.log('Dynamic models endpoint not available, using enhanced mock list');
        return this.getEnhancedModelsList();
      }
    } catch (error) {
      console.log('Failed to authenticate for models list, using mock list');
      return this.getEnhancedModelsList();
    }
  }

  getEnhancedModelsList() {
    return {
      object: 'list',
      data: [
        ...QWEN_MODELS,
        // Add additional models that might be available
        {
          id: 'qwen3-coder-480b',
          object: 'model',
          created: 1754686206,
          owned_by: 'qwen',
          context_length: 262144,
          capabilities: ['text', 'code', 'tools']
        },
        {
          id: 'qwen-vl-plus',
          object: 'model',
          created: 1754686206,
          owned_by: 'qwen',
          context_length: 32768,
          capabilities: ['text', 'image', 'video']
        },
        {
          id: 'qwen-vl-max',
          object: 'model',
          created: 1754686206,
          owned_by: 'qwen',
          context_length: 32768,
          capabilities: ['text', 'image', 'video']
        }
      ]
    };
  }

  

  /**
   * Stream chat completions from Qwen API
   * @param {Object} request - The chat completion request
   * @returns {Promise<Stream>} - A stream of SSE events
   */
  async streamChatCompletions(request) {
    // Load all accounts for multi-account support
    await this.authManager.loadAllAccounts();
    const accountIds = this.authManager.getAccountIds();
    
    // If no additional accounts, use default behavior
    if (accountIds.length === 0) {
      // Get a valid access token (automatically refreshes if needed)
      const accessToken = await this.authManager.getValidAccessToken();
      const credentials = await this.authManager.loadCredentials();
      const apiEndpoint = await this.getApiEndpoint(credentials);
      
      // Make streaming API call
      const url = `${apiEndpoint}/chat/completions`;
      const payload = {
        model: request.model || DEFAULT_MODEL,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        tools: request.tools,
        tool_choice: request.tool_choice,
        stream: true, // Enable streaming
        stream_options: { 
          include_usage: true, // Include usage data in final chunk
          ...(request.stream_options || {}) // Allow custom stream options
        }
      };
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)',
        'Accept': 'text/event-stream'
      };
      
      try {
        // Create a pass-through stream to forward the response
        const stream = new PassThrough();
        
        // Make the HTTP request with streaming response
        const response = await axios.post(url, payload, {
          headers,
          timeout: 300000, // 5 minute timeout
          responseType: 'stream'
        });
        
        // Pipe the response stream to our pass-through stream
        response.data.pipe(stream);
        
        // Reset auth error count on successful request start
        this.resetAuthErrorCount('default');
        
        // Handle authentication errors during streaming
        response.data.on('error', async (error) => {
          if (isAuthError(error)) {
            // Increment auth error count (for tracking, even though we can't rotate)
            const authErrorCount = this.incrementAuthErrorCount('default');
            console.log(`\x1b[33mDetected auth error during streaming (${error.response?.status || 'N/A'}) (consecutive count: ${authErrorCount})\x1b[0m`);
            
            console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh during streaming...`);
            try {
              // Force refresh the token
              await this.authManager.performTokenRefresh(credentials);
              console.log('\x1b[32m%s\x1b[0m', 'Token refreshed successfully during streaming');
            } catch (refreshError) {
              console.error('\x1b[31m%s\x1b[0m', 'Token refresh failed during streaming');
              stream.emit('error', new Error(`Qwen API auth error during streaming: ${error.message}`));
            }
          } else {
            stream.emit('error', error);
          }
        });
        
        return stream;
      } catch (error) {
        // Check if this is an authentication error that might benefit from a retry
        if (isAuthError(error)) {
          // Increment auth error count (for tracking, even though we can't rotate)
          const authErrorCount = this.incrementAuthErrorCount('default');
          console.log(`\x1b[33mDetected auth error (${error.response?.status || 'N/A'}) (consecutive count: ${authErrorCount})\x1b[0m`);
          
          console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh and retry...`);
          try {
            // Force refresh the token and retry once
            await this.authManager.performTokenRefresh(credentials);
            const newAccessToken = await this.authManager.getValidAccessToken();
            
            // Retry the request with the new token
            console.log('\x1b[36m%s\x1b[0m', 'Retrying streaming request with refreshed token...');
            const retryHeaders = {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${newAccessToken}`,
              'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)',
              'Accept': 'text/event-stream'
            };
            
            // Create a new pass-through stream for the retry
            const retryStream = new PassThrough();
            
            const retryResponse = await axios.post(url, payload, {
              headers: retryHeaders,
              timeout: 300000,
              responseType: 'stream'
            });
            
            retryResponse.data.pipe(retryStream);
            console.log('\x1b[32m%s\x1b[0m', 'Streaming request succeeded after token refresh');
            // Reset auth error count on successful request
            this.resetAuthErrorCount('default');
            return retryStream;
          } catch (retryError) {
            console.error('\x1b[31m%s\x1b[0m', 'Streaming request failed even after token refresh');
            // If retry fails, throw the original error with additional context
            throw new Error(`Qwen API streaming error (after token refresh attempt): ${error.response?.status || 'N/A'} ${JSON.stringify(error.response?.data || error.message)}`);
          }
        }
        
        if (error.response) {
          // The request was made and the server responded with a status code
          throw new Error(`Qwen API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          // The request was made but no response was received
          throw new Error(`Qwen API request failed: No response received`);
        } else {
          // Something happened in setting up the request that triggered an Error
          throw new Error(`Qwen API request failed: ${error.message}`);
        }
      }
    } else {
      // Start with the default account if specified, otherwise start with the first account
      let currentAccountIndex = 0;
      const defaultAccount = require('../config.js').defaultAccount;
      if (defaultAccount && accountIds.includes(defaultAccount)) {
        currentAccountIndex = accountIds.indexOf(defaultAccount);
        console.log(`\x1b[36mUsing default account: ${defaultAccount}\x1b[0m`);
      }
      let lastError = null;
      const maxRetries = accountIds.length;
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          // Get the current account (sticky until quota error)
          const accountId = accountIds[currentAccountIndex];
          const credentials = this.authManager.getAccountCredentials(accountId);
          
          if (!credentials) {
            // Move to next account if current one is invalid
            currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
            continue;
          }
          
          // Show which account we're using
          console.log(`\x1b[36mUsing account ${accountId} (Request #${this.getRequestCount(accountId) + 1} today)\x1b[0m`);
          
          // Get a valid access token for this account
          const accessToken = await this.authManager.getValidAccessToken(accountId);
          
          // Get API endpoint
          const apiEndpoint = await this.getApiEndpoint(credentials);
          
          // Make streaming API call
          const url = `${apiEndpoint}/chat/completions`;
          const payload = {
            model: request.model || DEFAULT_MODEL,
            messages: request.messages,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            top_p: request.top_p,
            tools: request.tools,
            tool_choice: request.tool_choice,
            stream: true, // Enable streaming
            stream_options: { 
              include_usage: true, // Include usage data in final chunk
              ...(request.stream_options || {}) // Allow custom stream options
            }
          };
          
          const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)',
            'Accept': 'text/event-stream'
          };
          
          // Increment request count for this account
          await this.incrementRequestCount(accountId);
          
          // Create a pass-through stream to forward the response
          const stream = new PassThrough();
          
          // Make the HTTP request with streaming response
          const response = await axios.post(url, payload, {
            headers,
            timeout: 300000, // 5 minute timeout
            responseType: 'stream'
          });
          
          // Pipe the response stream to our pass-through stream
          response.data.pipe(stream);
          
          // Reset auth error count on successful request start
          this.resetAuthErrorCount(accountId);
          
          // Handle authentication errors during streaming
          response.data.on('error', async (error) => {
            if (isAuthError(error)) {
              // Increment auth error count for this account
              const authErrorCount = this.incrementAuthErrorCount(accountId);
              console.log(`\x1b[33mDetected auth error during streaming (${error.response?.status || 'N/A'}) for account ${accountId} (consecutive count: ${authErrorCount})\x1b[0m`);
              
              // If we've had 3 consecutive auth errors, emit an error to trigger rotation
              if (authErrorCount >= 3) {
                console.log(`\x1b[33mAccount ${accountId} has had ${authErrorCount} consecutive auth errors during streaming, triggering rotation...\\x1b[0m`);
                stream.emit('error', new Error(`Account ${accountId} has consecutive auth errors requiring rotation`));
              } else {
                console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh during streaming...`);
                try {
                  // Force refresh the token
                  await this.authManager.performTokenRefresh(credentials, accountId);
                  console.log('\x1b[32m%s\x1b[0m', 'Token refreshed successfully during streaming');
                } catch (refreshError) {
                  console.error('\x1b[31m%s\x1b[0m', 'Token refresh failed during streaming');
                  stream.emit('error', new Error(`Qwen API auth error during streaming: ${error.message}`));
                }
              }
            } else {
              stream.emit('error', error);
            }
          });
          
          return stream;
        } catch (error) {
          lastError = error;
          
          // Check if this is a quota exceeded error
          if (isQuotaExceededError(error)) {
            console.log(`\x1b[33mAccount ${accountId} quota exceeded (Request #${this.getRequestCount(accountId)}), rotating to next account...\\x1b[0m`);
            // Move to next account for the next request
            currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
            // Peek at the next account to show which one we're rotating to
            const nextAccountId = accountIds[currentAccountIndex];
            console.log(`\x1b[33mWill try account ${nextAccountId} next\\x1b[0m`);
            // Continue to next account
            continue;
          }
          
          // Check if this is an authentication error that might benefit from a retry
          if (isAuthError(error)) {
            // Get current account info
            const accountId = accountIds[currentAccountIndex];
            
            // Increment auth error count for this account
            const authErrorCount = this.incrementAuthErrorCount(accountId);
            console.log(`\x1b[33mDetected auth error (${error.response?.status || 'N/A'}) for account ${accountId} (consecutive count: ${authErrorCount})\x1b[0m`);
            
            // If we've had 3 consecutive auth errors, rotate to next account
            if (authErrorCount >= 3) {
              console.log(`\x1b[33mAccount ${accountId} has had ${authErrorCount} consecutive auth errors, rotating to next account...\\x1b[0m`);
              // Move to next account for the next request
              currentAccountIndex = (currentAccountIndex + 1) % accountIds.length;
              // Peek at the next account to show which one we're rotating to
              const nextAccountId = accountIds[currentAccountIndex];
              console.log(`\x1b[33mWill try account ${nextAccountId} next\\x1b[0m`);
              // Continue to next account
              continue;
            }
            
            // Try token refresh for auth errors (less than 3 consecutive)
            console.log('\x1b[33m%s\x1b[0m', `Attempting token refresh and retry...`);
            try {
              const credentials = this.authManager.getAccountCredentials(accountId);
              if (credentials) {
                // Force refresh the token and retry once
                await this.authManager.performTokenRefresh(credentials, accountId);
                const newAccessToken = await this.authManager.getValidAccessToken(accountId);
                
                // Retry the request with the new token
                console.log('\x1b[36m%s\x1b[0m', 'Retrying streaming request with refreshed token...');
                const retryHeaders = {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${newAccessToken}`,
                  'User-Agent': 'QwenOpenAIProxy/1.0.0 (linux; x64)',
                  'Accept': 'text/event-stream'
                };
                
                // Create a new pass-through stream for the retry
                const retryStream = new PassThrough();
                
                const retryResponse = await axios.post(url, payload, {
                  headers: retryHeaders,
                  timeout: 300000,
                  responseType: 'stream'
                });
                
                retryResponse.data.pipe(retryStream);
                console.log('\x1b[32m%s\x1b[0m', 'Streaming request succeeded after token refresh');
                // Reset auth error count on successful request
                this.resetAuthErrorCount(accountId);
                return retryStream;
              }
            } catch (retryError) {
              console.error('\x1b[31m%s\x1b[0m', 'Streaming request failed even after token refresh');
              // If retry fails, continue to next account
              continue;
            }
          }
          
          // For other errors, re-throw
          if (error.response) {
            // The request was made and the server responded with a status code
            throw new Error(`Qwen API error: ${error.response.status} ${JSON.stringify(error.response.data)}`);
          } else if (error.request) {
            // The request was made but no response was received
            throw new Error(`Qwen API request failed: No response received`);
          } else {
            // Something happened in setting up the request that triggered an Error
            throw new Error(`Qwen API request failed: ${error.message}`);
          }
        }
      }
      
      // If we get here, all accounts failed
      throw new Error(`All accounts failed. Last error: ${lastError?.message || 'Unknown error'}`);
    }
  }
}

module.exports = { QwenAPI };