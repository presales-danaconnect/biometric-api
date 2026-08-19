---
inclusion: always
---

# Technical Stack

## Backend Framework

- **AWS Amplify Gen 2** - Infrastructure as code with TypeScript
- **Language** - TypeScript

## AWS Services

| Service | Purpose |
|---------|---------|
| **Cognito** | Authentication via Client Credentials (machine-to-machine) |
| **API Gateway** | Public REST endpoints with Cognito Authorizer |
| **Lambda** | One function per endpoint and per biometric step |
| **DynamoDB** | channels and circuits tables |
| **Rekognition** | Liveness detection and face comparison |
| **Bedrock** | Claude Sonnet 4.5 for OCR and data verification |

## Technical Constraints

- **Circuit Expiration** - 15 minutes from creation
- **Single Use** - Each circuit can only be completed once
- **Step Execution Order** - Steps run sequentially as defined in channel settings
- **Extensibility** - New steps added as independent Lambda functions
- **Admin API** - Requires x-admin-key header (for support team Postman usage)

## Naming Conventions

- **AWS Resources** - `biometric-api-{env}-{resource}`
- **Tags** - `Project=biometric-api`, `Environment={env}`, `Owner=danaconnect`

## Environment Variables

- Amplify auto-manages environment-specific variables
- Cognito and DynamoDB connections configured via Amplify