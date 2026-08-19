---
inclusion: always
---

# Security Model

## Authentication Layers

### Public API (Client Applications)

All biometric endpoints require **Bearer token** authentication via Cognito:

| Header | Value | Purpose |
|--------|-------|---------|
| `Authorization` | `Bearer <JWT>` | Cognito-issued JWT token |

- **Flow**: OAuth2 Client Credentials (machine-to-machine)
- **Token Endpoint**: `POST /oauth2/token`
- **Token Validation**: API Gateway Cognito Authorizer validates JWT signature and expiration

### Admin API (Support Team)

Admin endpoints require **x-admin-key** header:

| Header | Value | Purpose |
|--------|-------|---------|
| `x-admin-key` | `<admin-secret-key>` | Internal admin authentication |

- Used exclusively for Postman operations by support team
- Creates Cognito clients and DynamoDB channels
- **Not exposed to end clients**

## Circuit Security

### Expiration
- Circuits automatically expire **15 minutes** after creation
- Expired circuits reject all processing requests
- Expiration enforced at database level (`expires_at` attribute)

### Single Use
- Each circuit can only be successfully completed once
- Circuit status transitions: `pending` → `in_progress` → `completed` | `failed`
- Once `completed`, circuit cannot be reprocessed

## Cognito Configuration

- **User Pool**: Amplify-managed
- **App Client**: Client Credentials flow enabled
- **Token Scope**: Amplify-defined (minimal required permissions)
- **Token Expiration**: Standard Cognito token lifetime

## Data Security

- **DynamoDB**: Encrypted at rest via AWS-managed keys
- **Lambda Execution**: Minimal IAM permissions following least-privilege
- **Webhook Signing**: Optional HMAC verification for webhook recipients

## Tagging for Audit

All AWS resources include standard tags:
- `Project=biometric-api`
- `Environment={env}`
- `Owner=danaconnect`