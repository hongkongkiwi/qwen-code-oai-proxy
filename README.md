# Qwen OpenAI-Compatible Proxy Server - Works with opencode , crush ,  claude code router ,  roo code , cline mostly everything 

A proxy server that exposes Qwen models through an OpenAI-compatible API endpoint. Has tool calling and stream  

## Important Notes

Users might face errors or 504 Gateway Timeout issues when using contexts with 130,000 to 150,000 tokens or more. This appears to be a practical limit for Qwen models. Qwen code it self tends to also break down and get stuck on this limit . 


## Quick Start

1.  **Install Dependencies**:
    ```bash
    npm install
    ```
2.  **Authenticate**: You need to authenticate with Qwen to generate the required credentials file.
    *   Run `npm run auth:add <account>` to authenticate with your Qwen account
    *   This will create the `~/.qwen/oauth_creds.json` file needed by the proxy server
    *   Alternatively, you can use the official `qwen-code` CLI tool from [QwenLM/qwen-code](https://github.com/QwenLM/qwen-code)
3.  **Start the Server**:
    ```bash
    npm start
    ```
4.  **Use the Proxy**: Point your OpenAI-compatible client to `http://localhost:8080/v1`.


5. API key ? Random doesn't matter .

## Docker Compose

You can run the proxy server using Docker Compose for easy deployment and isolation.

### Prerequisites

Before using Docker Compose, you need to authenticate with Qwen locally:

```bash
npm install
npm run auth:add <account>
```

This creates the `~/.qwen/oauth_creds.json` file that will be mounted into the container.

### Running with Docker Compose

1. **Start the service**:
   ```bash
   docker-compose up -d
   ```

2. **View logs**:
   ```bash
   docker-compose logs -f
   ```

3. **Stop the service**:
   ```bash
   docker-compose down
   ```

### Configuration

The Docker Compose configuration includes:
- **Port mapping**: Maps container port 8080 to host port 8080
- **Volume mounts**: 
  - `~/.qwen` directory (read-only) for authentication credentials
  - `./logs` directory for application logs
- **Environment variables**: Pre-configured with recommended settings
- **Auto-restart**: Container restarts automatically unless manually stopped

### Custom Configuration

To customize the Docker deployment:

1. **Set API key**: Create a `.env` file in the project root:
   ```bash
   FAKE_API_KEY=your-secret-api-key-here
   ```

2. **Build locally**: Uncomment the `build: .` line and comment the `image:` line in `docker-compose.yml`

3. **Change port**: Modify the port mapping in `docker-compose.yml`:
   ```yaml
   ports:
     - "3000:8080"  # Maps host port 3000 to container port 8080
   ```

## Multi-Account Support

The proxy supports multiple Qwen accounts to overcome the 2,000 requests per day limit per account. Accounts are automatically rotated when quota limits are reached.

### Setting Up Multiple Accounts

1. List existing accounts:
   ```bash
   npm run auth:list
   ```

2. Add a new account:
   ```bash
   npm run auth:add <account-id>
   ```
   Replace `<account-id>` with a unique identifier for your account (e.g., `account2`, `team-account`, etc.)

3. Remove an account:
   ```bash
   npm run auth:remove <account-id>
   ```

### How Account Rotation Works

- When you have multiple accounts configured, the proxy will automatically rotate between them
- Each account has a 2,000 request per day limit
- When an account reaches its limit, Qwen's API will return a quota exceeded error
- The proxy detects these quota errors and automatically switches to the next available account
- If a DEFAULT_ACCOUNT is configured, the proxy will use that account first before rotating to others
- Request counts are tracked locally and reset daily at UTC midnight
- You can check request counts for all accounts with:
  ```bash
  npm run auth:counts
  ```

### Account Usage Monitoring

The proxy provides real-time feedback in the terminal:
- Shows which account is being used for each request
- Displays current request count for each account
- Notifies when an account is rotated due to quota limits
- Indicates which account will be tried next during rotation
- Shows which account is configured as the default account on server startup
- Marks the default account in the account list display

## Configuration

The proxy server can be configured using environment variables. Create a `.env` file in the project root or set the variables directly in your environment.

*   `LOG_FILE_LIMIT`: Maximum number of debug log files to keep (default: 20)
*   `DEBUG_LOG`: Set to `true` to enable debug logging (default: false)
*   `STREAM`: Set to `true` to enable streaming responses (default: false)
    *   **Important**: Set this to `true` when using tools like opencode or crush that require streaming responses
*   `FAKE_API_KEY`: Set a custom API key for authentication (leave empty to allow any API key/disable authentication)
    *   **Security**: Use this when exposing the proxy to the internet to prevent unauthorized access
*   `DEFAULT_ACCOUNT`: Specify which account the proxy should use by default (when using multi-account setup)
    *   Should match the name used when adding an account with `npm run auth add <name>`
    *   If not set or invalid, the proxy will use the first available account

Example `.env` file:
```bash
# API Key for authentication (leave empty to allow any API key)
FAKE_API_KEY=your-secret-api-key-here

# Keep only the 10 most recent log files
LOG_FILE_LIMIT=10

# Enable debug logging (log files will be created)
DEBUG_LOG=true

# Enable streaming responses (disabled by default)
# Required for tools like opencode and crush
STREAM=true

# Specify which account to use by default (when using multi-account setup)
# Should match the name used when adding an account with 'npm run auth add <name>'
DEFAULT_ACCOUNT=my-primary-account
```

## Example Usage

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'your-secret-api-key-here', // Use your FAKE_API_KEY value, or any value if authentication is disabled
  baseURL: 'http://localhost:8080/v1'
});

async function main() {
  const response = await openai.chat.completions.create({
    model: 'qwen-coder-plus',
    messages: [
      { "role": "user", "content": "Hello!" }
    ]
  });

  console.log(response.choices[0].message.content);
}

main();
```

## Supported Endpoints

*   `POST /v1/chat/completions`


## Tool Calling Support

This proxy server supports tool calling functionality, allowing you to use it with tools like opencode and crush.

### opencode Configuration

To use with opencode, add the following to `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "myprovider": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "proxy",
      "options": {
        "baseURL": "http://localhost:8080/v1"
      },
      "models": {
        "qwen3-coder-plus": {
          "name": "qwen3"
        }
      }
    }
  }
}
```

**Note**: For opencode to work properly with streaming responses, you need to enable streaming in the proxy server by setting `STREAM=true` in your `.env` file.

### crush Configuration

To use with crush, add the following to `~/.config/crush/crush.json`:

```json
{
  "$schema": "https://charm.land/crush.json",
  "providers": {
    "proxy": {
      "type": "openai",
      "base_url": "http://localhost:8080/v1",
      "api_key": "",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "cost_per_1m_in": 0.0,
          "cost_per_1m_out": 0.0,
          "cost_per_1m_in_cached": 0,
          "cost_per_1m_out_cached": 0,
          "context_window": 150000,
          "default_max_tokens": 64000
        }
      ]
    }
  }
}
```

**Note**: For crush to work properly with streaming responses, you need to enable streaming in the proxy server by setting `STREAM=true` in your `.env` file.

### Claude code Router 
```json
{
  "LOG": false,
  "Providers": [
    {
      "name": "qwen-code",
      "api_base_url": "http://localhost:8080/v1/chat/completions/",
      "api_key": "wdadwa-random-stuff",
      "models": ["qwen3-coder-plus"],
      "transformer": {
        "use": [
          [
            "maxtoken",
            {
              "max_tokens": 65536
            }
          ],
          "enhancetool",
          "cleancache"
        ]
      }
    }
  ],
  "Router": {
    "default": "qwen-code,qwen3-coder-plus"
  }
}
```

### Octofriend Configuration

To use with Octofriend, add the following configuration:

```json
{
  "providers": [
    {
      "id": "qwen-proxy",
      "name": "Qwen via Proxy",
      "type": "openai-compatible",
      "config": {
        "baseURL": "http://localhost:8080/v1",
        "apiKey": "any-key-here"
      },
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "Qwen3 Coder Plus",
          "contextWindow": 150000,
          "maxTokens": 64000,
          "supportsFunctions": true,
          "supportsStreaming": true
        },
        {
          "id": "qwen3-coder-turbo", 
          "name": "Qwen3 Coder Turbo",
          "contextWindow": 150000,
          "maxTokens": 64000,
          "supportsFunctions": true,
          "supportsStreaming": true
        },
        {
          "id": "qwen-vl-plus",
          "name": "Qwen VL Plus",
          "contextWindow": 32768,
          "maxTokens": 8192,
          "supportsFunctions": true,
          "supportsStreaming": true,
          "supportsImages": true,
          "supportsVideo": true
        }
      ]
    }
  ]
}
```

**Note**: 
- Octofriend requires streaming to be enabled. Set `STREAM=true` in your `.env` file.
- If you have set a `FAKE_API_KEY` in your proxy configuration, use that value in the `apiKey` field.
- The proxy supports tool calling, so `supportsFunctions` is set to `true` for all models.




## Testing

The proxy includes a comprehensive test suite to verify all features are working correctly.

### Running Tests

Run all tests:
```bash
npm run test:comprehensive
```

Run individual test suites:
```bash
npm run test:multimodal    # Test multimodal input support
npm run test:models         # Test models endpoint
npm run test:streaming      # Test enhanced streaming
npm run test:rate-limits    # Test rate limit headers
npm run test:errors         # Test error handling
```

### Test Coverage

The test suite covers:
- **Multimodal Support**: Image and video input validation
- **Models Endpoint**: Dynamic model listing with enhanced metadata
- **Streaming**: Custom stream options and enhanced streaming
- **Rate Limiting**: Proper pass-through of rate limit headers
- **Error Handling**: Comprehensive error mapping and validation

## Advanced Features

### Multimodal Support
The proxy supports multimodal inputs for vision-language models:
- Image inputs via data URLs or HTTP/HTTPS URLs
- Video inputs for compatible models
- Configurable detail levels (low, high, auto)

### Rate Limit Headers
The proxy automatically passes through rate limit headers from the Qwen API, allowing clients to track:
- Request limits and remaining quota
- Token limits and usage
- Reset times for rate limits

### Enhanced Error Handling
All Qwen API errors are properly mapped to OpenAI-compatible error types:
- Authentication errors
- Rate limit errors
- Context length errors
- Invalid request errors
- Quota exceeded errors

## Token Counting

The proxy now displays token counts in the terminal for each request, showing both input tokens and API-returned usage statistics (prompt, completion, and total tokens).

For more detailed documentation, see the `docs/` directory.

For information about configuring a default account, see `docs/default-account.md`.
