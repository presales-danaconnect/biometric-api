# biometric-api

Biometric SDK as a service (SaaS) that allows any company to integrate identity verifications in their applications via a modern REST API.

## Architecture

- **AWS Amplify Gen 2** - Infrastructure as code with TypeScript
- **API Gateway** - REST endpoints with Cognito Authorizer
- **DynamoDB** - `channels` and `circuits` tables
- **S3** - Bucket for biometric documents
- **AWS Rekognition** - Liveness detection and face comparison
- **AWS Bedrock** - Claude Sonnet 4.5 for OCR and data verification
- **Cognito User Pool** - OAuth2 Client Credentials authentication
- **Lambda Functions** - 8 functions (fn-admin-*, fn-start-circuit, fn-get-config, fn-upload-url, fn-process-circuit)

## Verification Flows

### Liveness Check

1. Frontend calls `DetectFaceLiveness` API with a base64-encoded image
2. Rekognition returns a `sessionId` and processes the video/image
3. Frontend calls `process_circuit` with the `sessionId`
4. Lambda calls `GetFaceLivenessSessionResults` to get the confidence score
5. If successful, the reference image is saved to S3: `s3://{bucket}/{codeClient}/{circuitId}/liveness-reference.jpg`

**Result fields:** `success`, `confidence`, `s3Key`

### OCR (Optical Character Recognition)

1. Frontend uploads front (and optionally back) document images to S3
2. `process_circuit` sends images to Bedrock Claude for analysis
3. Bedrock validates if image is a valid identity document (`isDocument` flag)
4. Extracts: `nombre`, `apellido`, `documentNumber`, `fechaNacimiento`, `fechaVencimiento`, `nacionalidad`

**Bedrock Model:** `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (inference profile)

**Result fields:** `success`, `extractedData`, `errorCode` (NOT_A_DOCUMENT)

### Compare Faces

1. Frontend calls `process_circuit` for the `compare-faces` step
2. Lambda downloads `liveness-reference.jpg` (from liveness step) and `front.jpg` (from OCR)
3. Rekognition `CompareFaces` compares both images
4. Returns similarity score (0-100)

**Result fields:** `success`, `similarity`, `errorCode` (LOW_SIMILARITY, NO_FACE_IN_IMAGE)

### Data Verification

1. Frontend calls `process_circuit` for the `data-verification` step
2. Lambda sends OCR extracted data and person data (from `start_circuit`) to Bedrock Claude
3. Bedrock compares: document number, name similarity
4. Returns `samePerson`, `documentNumberMatch`, `nameMatch`, `confidence`, `reason`

**Result fields:** `success`, `matches`, `confidence`, `reason`, `errorCode` (DATA_MISMATCH)

## Environment Variables

| Variable | Description | How to obtain |
|----------|-------------|---------------|
| `ADMIN_KEY` | Key for admin endpoints (Postman support team) | `openssl rand -base64 32` |
| `INTERNAL_KEY` | Key for internal portal endpoints (frontend calls) | `openssl rand -base64 32` |
| `USER_POOL_ID` | Cognito User Pool ID | Amplify Console outputs after first deploy |

## Installation

### Prerequisites

- AWS account with permissions for Amplify, API Gateway, DynamoDB, S3, Rekognition, and Bedrock
- GitHub account with repository fork

### Installation Steps

1. **Fork the repository**

   Fork this repository on GitHub and clone locally:

   ```bash
   git clone https://github.com/YOUR_USER/biometric-api.git
   cd biometric-api
   ```

2. **Create app in Amplify**

   - Go to AWS Amplify Console
   - Click "New app" → "Build any app"
   - Connect the forked repository
   - Select the `main` branch

3. **Generate ADMIN_KEY and INTERNAL_KEY**

   ```bash
   openssl rand -base64 32
   ```

   This command generates a random 32-byte secret key encoded in Base64.

4. **Configure environment variables**

   In the Amplify Console, go to:
   - **Environment variables** → **Edit**

5. **Deploy**

   - Amplify will start the deployment automatically
   - First time: creates all infrastructure resources
   - After deployment, `addOutput` will contain: `userPoolId`, `apiGatewayUrl`, etc.

## API Reference

Full API documentation is available at the deployed Amplify URL:

- **Production**: https://biometric-api-main.amplifyapp.com
- **Local**: http://localhost:3001

The documentation covers:

- **Client Integration**
  - Authentication (POST /oauth2/token)
  - Start Verification (POST /api/biometric/start_circuit/{channel_id})
  - Webhook Events (error codes, payload examples, retry behavior)

- **Admin & Support**
  - Admin API (create client, create/get/update channel)
  - Internal API (get_config, upload-url, process_circuit)

Each endpoint includes:
- Headers, parameters, request body
- Response examples
- cURL commands

## Channel Settings JSON

Complete configuration for a verification channel:

```json
{
  "steps": ["liveness", "ocr", "data-verification", "compare-faces"],
  "baseUrl": "https://verification.client.com",
  "webhookUrl": "https://api.client.com/callback/biometric",
  "projectId": "201208",
  "redirectUrl": "https://app.client.com/result",
  "ui": {
    "headerTitle": "Identity Verification",
    "headerLogoUrl": "https://cdn.client.com/logo.png",
    "bgColor": "#FCFCFC",
    "footerPrivacyPolicyUrl": "https://client.com/privacy",
    "footerWebsiteUrl": "https://client.com",
    "colors": {
      "primary": "#0a1a3c",
      "background": "#eff3f9",
      "headerBackground": "#ffffff",
      "footerBackground": "#0a1a3c",
      "headerFontColor": "#111827",
      "footerFontColor": "#ffffff"
    },
    "layout": {
      "headerAlign": "center",
      "footerAlign": "center"
    }
  },
  "thresholds": {
    "livenessConfidenceThreshold": 80,
    "compareFacesSimilarityThreshold": 80,
    "ocrConfidenceThreshold": 70,
    "maxAttempts": 3,
    "requiresBackDocument": false,
    "documentType": 1
  }
}
```

## Project Structure

```
biometric-api/
├── amplify/
│   ├── auth/resource.ts           # Cognito User Pool configuration
│   ├── data/resource.ts           # DynamoDB tables (channels, circuits)
│   ├── storage/resource.ts        # S3 bucket for documents
│   ├── api/resource.ts            # API Gateway configuration
│   ├── functions/
│   │   ├── fn-admin-create-client/    # Create Cognito App Clients
│   │   ├── fn-admin-create-channel/   # Create channels
│   │   ├── fn-admin-get-channel/      # Read channels
│   │   ├── fn-admin-update-channel/   # Update channels
│   │   ├── fn-start-circuit/          # Start verification
│   │   ├── fn-get-config/             # Get UI config for frontend
│   │   ├── fn-upload-url/             # Generate presigned URLs
│   │   └── fn-process-circuit/        # Orchestrator for biometric steps
│   ├── types/index.ts             # TypeScript interfaces
│   └── backend.ts                 # Main Amplify stack
├── docs/
│   └── architecture.md            # Architecture documentation
├── .kiro/                         # Kiro AI configuration
├── package.json
└── README.md                      # This file
```

## Security

- **Expired circuits**: 15 minutes after creation
- **Single-use circuits**: Can only be completed once
- **Tags on all resources**: `Project=biometric-api`, `Environment={env}`, `Owner=danaconnect`

## AWS Resources Created

| Resource | Name | Description |
|----------|------|-------------|
| DynamoDB | `biometric-api-{env}-channels` | Channel configuration per client |
| DynamoDB | `biometric-api-{env}-circuits` | Verification history |
| S3 | `biometric-api-{env}-documents` | Biometric images per tenant/circuit |
| Cognito User Pool | `biometric-api-{env}-userpool` | Machine-to-machine authentication |
| Cognito Domain | `biometric-api-{env}` | OAuth2 token endpoint |
| API Gateway | `biometric-api-{env}-gateway` | Public and admin REST endpoints |
| Lambda | `biometric-api-{env}-fn-admin-create-client` | Create Cognito App Client |
| Lambda | `biometric-api-{env}-fn-admin-create-channel` | Create channel in DynamoDB |
| Lambda | `biometric-api-{env}-fn-admin-get-channel` | Get channel |
| Lambda | `biometric-api-{env}-fn-admin-update-channel` | Update channel (deep merge) |
| Lambda | `biometric-api-{env}-fn-start-circuit` | Start verification |
| Lambda | `biometric-api-{env}-fn-get-config` | Get UI config for frontend |
| Lambda | `biometric-api-{env}-fn-upload-url` | Generate presigned URL for S3 |
| Lambda | `biometric-api-{env}-fn-process-circuit` | Biometric steps orchestrator |

## Security by Layers

| Endpoint | Auth | Who calls it |
|----------|------|--------------|
| POST /oauth2/token | Public | Client backend |
| POST /api/biometric/start_circuit | Bearer token Cognito | Client backend |
| GET /api/biometric/get_config | x-internal-key | Portal frontend |
| GET /api/biometric/upload-url | x-internal-key | Portal frontend |
| POST /api/biometric/process_circuit | x-internal-key | Portal frontend |
| POST /api/admin/* | x-admin-key | Support (Postman) |

> **Note**: Frontend endpoints (get_config, upload-url, process_circuit) use `x-internal-key` header because they are called directly from the end user's browser, who does not have access to Cognito tokens.

## Architecture

![biometric-api Architecture](docs/architecture.png)