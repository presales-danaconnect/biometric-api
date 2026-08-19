---
inclusion: always
---

# Project Structure

## Directory Layout

```
biometric-api/
├── amplify/
│   ├── auth/resource.ts      # Cognito configuration
│   ├── data/resource.ts      # DynamoDB tables definition
│   ├── backend.ts            # Amplify backend assembly
│   └── package.json          # Amplify dependencies
├── src/
│   ├── admin/                # Admin API endpoints
│   │   ├── clients/          # POST /admin/clients/create
│   │   └── channels/         # GET/PUT/POST /admin/channels/*
│   ├── biometric/            # Biometric API endpoints
│   │   ├── start_circuit/    # POST /biometric/start_circuit/{channel_id}
│   │   ├── get_config/       # GET /biometric/get_config/{circuit_id}
│   │   ├── process_circuit/  # POST /biometric/process_circuit/{circuit_id}
│   │   └── steps/            # Individual step implementations
│   │       ├── liveness/     # Rekognition Liveness
│   │       ├── ocr/          # Bedrock Claude OCR
│   │       ├── compare-faces/# Rekognition CompareFaces
│   │       └── data-verification/ # Bedrock data comparison
│   └── oauth/                # POST /oauth2/token
└── .kiro/steering/           # This documentation
```

## API Endpoints

### OAuth
- `POST /oauth2/token` - Cognito Client Credentials flow

### Admin API (x-admin-key header required)
- `POST /api/admin/clients/create` - Create Cognito App Client
- `POST /api/admin/channels` - Create DynamoDB channel
- `GET /api/admin/channels/{id}` - Get channel by ID
- `PUT /api/admin/channels/{id}` - Update channel

### Biometric API (Bearer token required)
- `POST /api/biometric/start_circuit/{channel_id}` - Create circuit, return circuitId + link
- `GET /api/biometric/get_config/{circuit_id}` - Get UI config and steps for frontend
- `POST /api/biometric/process_circuit/{circuit_id}` - Execute current step, orchestrate results

## DynamoDB Tables

### channels Table
- **Partition Key**: `channel_id` (UUID)
- **Attributes**:
  - `code_client` - Client identifier
  - `cognito_client_id` - Associated Cognito client ID
  - `created_at` - Creation timestamp
  - `settings` (Map):
    - `steps[]` - Ordered list of biometric steps
    - `baseUrl` - Base URL for verification flow
    - `webhookUrl` - Webhook URL for completion notifications
    - `danaconnectProjectId` - DANAconnect project identifier
    - UI configuration and thresholds

### circuits Table
- **Partition Key**: `circuit_id` (UUID)
- **Attributes**:
  - `channel_id` - Parent channel reference
  - `status` - pending | in_progress | completed | failed
  - `current_step` - Current step being executed
  - `steps_completed[]` - Array of completed step names
  - `person` (Map) - Person data collected
  - `result` (Map) - Results keyed by step name
  - `created_at` - Creation timestamp
  - `expires_at` - Expiration timestamp (created_at + 15 minutes)

## Biometric Steps

Steps execute in order as defined in channel settings:

1. **liveness** - AWS Rekognition Liveness detection
2. **ocr** - AWS Bedrock Claude Sonnet 4.5 multimodal document processing
3. **compare-faces** - AWS Rekognition face comparison
4. **data-verification** - Bedrock-based comparison without external APIs

Each step is implemented as an independent Lambda function for extensibility.