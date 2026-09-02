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

## API Endpoints

### Admin API (x-admin-key header)

These endpoints are used by the support team via Postman to configure clients and channels.

#### POST /api/admin/clients/create

Creates a Cognito App Client for an enterprise client.

**Headers:**
```
x-admin-key: <ADMIN_KEY>
Content-Type: application/json
```

**Body:**
```json
{
  "code_client": "company",
  "username": "support@example.com"
}
```

**Response (201):**
```json
{
  "clientId": "abc123...",
  "clientSecret": "xyz789..."
}
```

> **Important**: The `clientSecret` is shown only once. Store it securely.

#### POST /api/admin/channels

Creates a biometric verification channel with its configuration.

**Headers:**
```
x-admin-key: <ADMIN_KEY>
Content-Type: application/json
```

**Body:**
```json
{
  "id_client": 123,
  "code_client": "company",
  "username": "support@example.com",
  "name": "Identity Verification",
  "channel_type": "biometric",
  "settings": {
    "steps": ["liveness", "ocr", "data-verification", "compare-faces"],
    "baseUrl": "https://verification.client.com",
    "webhookUrl": "https://api.client.com/callback/biometric",
    "projectId": "201208",
    "ui": {
      "headerTitle": "Identity Verification",
      "bgColor": "#FCFCFC",
      "colors": {
        "primary": "#0a1a3c",
        "background": "#eff3f9"
      },
      "layout": { "headerAlign": "center" }
    },
    "thresholds": {
      "livenessConfidenceThreshold": 80,
      "compareFacesSimilarityThreshold": 80
    }
  }
}
```

**Response (201):**
```json
{
  "channelId": "channel-uuid",
  "createdAt": "2025-08-20T10:00:00.000Z"
}
```

#### GET /api/admin/channels/{id}

Gets the complete configuration of a channel.

#### PUT /api/admin/channels/{id}

Updates a channel configuration with deep merge support.

### Public API (Bearer token)

These endpoints are used by client applications to integrate biometric verification.

#### POST /oauth2/token

Obtains an access token from Cognito using the Client Credentials flow.

**Body (x-www-form-urlencoded):**
```
grant_type=client_credentials
&client_id=<CLIENT_ID>
&client_secret=<CLIENT_SECRET>
&scope=biometric-danaconnect/access
```

**Response:**
```json
{
  "access_token": "eyJraWQi...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

#### POST /api/biometric/start_circuit/{channel_id}

Starts a new biometric verification circuit.

**Headers:**
```
Authorization: Bearer <ACCESS_TOKEN>
Content-Type: application/json
```

**Body:**
```json
{
  "person": {
    "name": "John Doe",
    "documentNumber": "12345678",
    "email": "john@example.com"
  }
}
```

**Response (201):**
```json
{
  "circuitId": "circuit-uuid",
  "link": "https://verification.client.com/?circuit=circuit-uuid"
}
```

#### GET /api/biometric/get_config/{circuit_id}

Gets UI configuration and thresholds for rendering the verification flow.

**Headers:**
```
x-internal-key: <INTERNAL_KEY>
```

**Response:**
```json
{
  "circuitId": "uuid",
  "status": "pending",
  "currentStep": null,
  "stepsCompleted": [],
  "steps": ["liveness", "ocr", "data-verification", "compare-faces"],
  "channelType": "biometric",
  "ui": {
    "headerTitle": "Identity Verification",
    "headerLogoUrl": "https://...",
    "bgColor": "#FCFCFC",
    "footerPrivacyPolicyUrl": "https://...",
    "footerWebsiteUrl": "https://...",
    "colors": { "primary": "#0a1a3c", ... },
    "layout": { "headerAlign": "center" }
  },
  "thresholds": {
    "livenessConfidenceThreshold": 80,
    "compareFacesSimilarityThreshold": 80,
    "ocrConfidenceThreshold": 70,
    "maxAttempts": 3,
    "requiresBackDocument": false
  }
}
```

#### GET /api/biometric/upload-url/{circuit_id}?type=front|back

Generates a presigned URL for uploading document images to S3.

**Headers:**
```
x-internal-key: <INTERNAL_KEY>
```

**Response:**
```json
{
  "uploadUrl": "https://biometric-api-dev-documents.s3.../client/uuid/front.jpg?...",
  "s3Key": "client/uuid/front.jpg",
  "expiresIn": 600
}
```

**Upload image with curl:**
```bash
curl -X PUT -H "Content-Type: image/jpeg" \
  --data-binary @front.jpg \
  "https://...presigned-url..."
```

#### POST /api/biometric/process_circuit/{circuit_id}

Executes a biometric verification step.

**Headers:**
```
x-internal-key: <INTERNAL_KEY>
Content-Type: application/json
```

**Body for liveness:**
```json
{
  "step": "liveness",
  "data": { "sessionId": "rekognition-session-id" }
}
```

**Body for OCR:**
```json
{
  "step": "ocr"
}
```

**Body for data-verification:**
```json
{
  "step": "data-verification"
}
```

**Body for compare-faces:**
```json
{
  "step": "compare-faces"
}
```

**Response:**
```json
{
  "circuitId": "uuid",
  "step": "liveness",
  "stepResult": {
    "success": true,
    "confidence": 95
  },
  "status": "in_progress",
  "stepsCompleted": ["liveness"],
  "nextStep": "ocr"
}
```

## Webhook

When a circuit reaches `completed` or `failed` status, a POST request is sent to the configured `webhookUrl`.

### When is the webhook triggered?

- Circuit status changes to `completed` (all steps successful)
- Circuit status changes to `failed` (max attempts reached or unrecoverable error)

### Error Codes by Step

| Step | Error Code | Description |
|------|------------|-------------|
| liveness | (none) | confidence < threshold → circuit status: failed |
| ocr | NOT_A_DOCUMENT | Image is not a valid identity document |
| compare-faces | LOW_SIMILARITY | Faces do not match, similarity > 0 |
| compare-faces | NO_FACE_IN_IMAGE | No face detected in the document |
| compare-faces | MAX_ATTEMPTS_REACHED | Max attempts exhausted → circuit status: failed |
| data-verification | DATA_MISMATCH | Data does not match person provided |
| data-verification | MAX_ATTEMPTS_REACHED | Max attempts exhausted → circuit status: failed |

### Webhook Payload - Success Example

```json
{
  "circuitId": "550e8400-e29b-41d4-a716-446655440000",
  "channelId": "550e8400-e29b-41d4-a716-446655440001",
  "channelType": "full",
  "status": "completed",
  "person": {
    "name": "John Doe",
    "documentNumber": "12345678",
    "email": "john@example.com"
  },
  "geolocation": "Av. Principal 123, Mexico City, Mexico",
  "wamid": "wamid.xxx123",
  "result": {
    "liveness": {
      "success": true,
      "confidence": 95,
      "s3Key": "client/uuid/liveness-reference.jpg"
    },
    "ocr": {
      "success": true,
      "extractedData": {
        "nombre": "JOHN",
        "apellido": "DOE",
        "documentNumber": "12345678",
        "fechaNacimiento": "01-01-1990",
        "fechaVencimiento": "01-01-2030",
        "nacionalidad": "VENEZOLANO"
      }
    },
    "compare-faces": {
      "success": true,
      "similarity": 91
    },
    "data-verification": {
      "success": true,
      "matches": {
        "documentNumber": true,
        "name": true
      }
    }
  },
  "completedAt": "2026-09-02T10:30:00.000Z"
}
```

### Webhook Payload - Failed Example

```json
{
  "circuitId": "550e8400-e29b-41d4-a716-446655440000",
  "channelId": "550e8400-e29b-41d4-a716-446655440001",
  "channelType": "full",
  "status": "failed",
  "person": {
    "name": "John Doe",
    "documentNumber": "12345678",
    "email": "john@example.com"
  },
  "geolocation": "Av. Principal 123, Mexico City, Mexico",
  "wamid": "wamid.xxx123",
  "result": {
    "liveness": {
      "success": true,
      "confidence": 95,
      "s3Key": "client/uuid/liveness-reference.jpg"
    },
    "ocr": {
      "success": true,
      "extractedData": {
        "nombre": "JOHN",
        "apellido": "DOE",
        "documentNumber": "12345678"
      }
    },
    "compare-faces": {
      "success": false,
      "errorCode": "MAX_ATTEMPTS_REACHED",
      "similarity": 0
    },
    "data-verification": {
      "success": true,
      "matches": {
        "documentNumber": true,
        "name": true
      }
    }
  },
  "completedAt": "2026-09-02T10:45:00.000Z"
}
```

### Step Retry Behavior

When a step fails with retryable errors (LOW_SIMILARITY, NO_FACE_IN_IMAGE, DATA_MISMATCH, NOT_A_DOCUMENT):

- The step is NOT added to `steps_completed`
- The circuit status remains `in_progress`
- For OCR-related failures (NOT_A_DOCUMENT, NO_FACE_IN_IMAGE, LOW_SIMILARITY), the user must re-upload the document
- For data-verification failures (DATA_MISMATCH), the user must retry with corrected data
- If `maxAttempts` is reached, the circuit status changes to `failed` and the webhook is triggered

## Integration Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Support Team    │     │ Enterprise Client│     │   End User      │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. POST /admin/clients/create                   │
         │───────────────────────>                        │
         │  Returns clientId + clientSecret               │
         │                                               │
         │  2. POST /admin/channels                        │
         │───────────────────────>                        │
         │  Returns channelId                             │
         │                                               │
         │                          3. POST /oauth2/token │
         │                          <─────────────────────│
         │                          Get access_token      │
         │                                               │
         │                          4. POST /start_circuit│
         │                          <─────────────────────│
         │                          Returns circuitId +   │
         │                          verification link     │
         │                                               │
         │                          5. User opens link    │
         │                          <─────────────────────>
         │                          Frontend loads UI      │
         │                                               │
         │                          6. GET /get_config    │
         │                          <─────────────────────>
         │                                               │
         │                          7. Upload documents   │
         │                          GET /upload-url → PUT │
         │                          to S3                 │
         │                                               │
         │                          8. POST /process_circuit│
         │                          Execute each step     │
         │                          <─────────────────────>
         │                                               │
         │                          9. Webhook callback   │
         │                          <─────────────────────
         │                          (if webhookUrl configured)
         │                                               │
         └─────────────────────────────┘
```

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

## Available Steps

| Step | Service | Description |
|------|---------|-------------|
| `liveness` | Rekognition | Verifies user is a real person (not photo/video) |
| `ocr` | Bedrock Claude | Extracts data from identity document |
| `data-verification` | Bedrock Claude | Compares OCR data with user information |
| `compare-faces` | Rekognition | Compares selfie with document photo |

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