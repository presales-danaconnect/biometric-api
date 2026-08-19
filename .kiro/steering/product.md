---
inclusion: always
---

# Product Overview

## What is Biometric API

Biometric API is DANAconnect's central backend for biometric verification services. It enables any enterprise to integrate biometric identity verification into their applications.

## Target Users

- **Enterprise Clients** - Companies integrating biometric verification into their apps
- **Support Team** - Creates clients and channels via Admin API (Postman)
- **End Users** - Final users completing verification via web link

## Complete Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Enterprise App  │     │   Support Team  │     │    End User     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ 1. POST /admin/clients/create                  │
         │───────────────────────>                        │
         │  Creates Cognito Client                        │
         │                                               │
         │  2. POST /admin/channels                       │
         │───────────────────────>                        │
         │  Creates DynamoDB Channel                      │
         │                                               │
         │  3. POST /biometric/start_circuit/{channel_id} │
         │<───────────────────────                        │
         │  Returns circuitId + verification link         │
         │                                               │
         │                          4. Open verification link
         │                          <─────────────────────>
         │                          User completes biometric steps
         │                                               │
         │  5. POST /biometric/process_circuit/{circuit_id}
         │<───────────────────────                        │
         │  Executes steps in order                       │
         │                                               │
         │                          6. Webhook to client │
         │<───────────────────────                        │
         │                                               │
         │                          7. Data to DANAconnect
         │                          <─────────────────────>
         └─────────────────────────────┘
```

## Business Value

- **Universal Integration** - Any company can integrate via REST API
- **Standardized Verification** - Consistent biometric workflows
- **Webhook Notifications** - Real-time completion alerts
- **DANAconnect Integration** - Automatic contact updates