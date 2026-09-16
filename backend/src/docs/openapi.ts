import { env } from '../config/env.js';

// Dynamically set servers based on environment
const getServers = () => {
  const isDevelopment = env.NODE_ENV !== 'production';
  const localUrl = `http://localhost:${env.PORT}`;
  
  if (isDevelopment) {
    // In development, put localhost first
    return [
      { 
        url: localUrl,
        description: 'Local Development'
      },
      { 
        url: 'http://65.1.191.185:3000',
        description: 'Production Server (HTTP)'
      },
      { 
        url: 'https://65.1.191.185:3000',
        description: 'Production Server (HTTPS)'
      }
    ];
  } else {
    // In production, put production servers first
    return [
      { 
        url: 'http://65.1.191.185:3000',
        description: 'Production Server (HTTP)'
      },
      { 
        url: 'https://65.1.191.185:3000',
        description: 'Production Server (HTTPS)'
      },
      { 
        url: localUrl,
        description: 'Local Development'
      }
    ];
  }
};

export const openApiSpec: any = {
  openapi: '3.0.3',
  info: {
    title: 'ChatLogix API',
    version: '0.1.0',
    description: 'WhatsApp webhook, vendors, conversations, and billing API'
  },
  servers: getServers(),
  tags: [
    { name: 'Auth' },
    { name: 'Health' },
    { name: 'Webhook' },
    { name: 'Vendors' },
    { name: 'Conversations' },
    { name: 'Orders' },
    { name: 'Payments' },
    { name: 'Shipping' },
    { name: 'Usage' },
    { name: 'Admin' }
  ],
  security: [
    {
      bearerAuth: []
    }
  ],
  paths: {
    '/api/auth/send-code': {
      post: {
        tags: ['Auth'],
        summary: 'Send phone verification code',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phoneNumber'],
                properties: {
                  phoneNumber: { type: 'string', example: '+15551234567' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Verification session created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessionInfo: { type: 'string' },
                    expiresIn: { type: 'integer', example: 120 }
                  }
                }
              }
            }
          },
          '400': { description: 'Invalid request' },
          '500': { description: 'Server error' }
        }
      }
    },
    '/api/auth/verify-code': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP and issue session token',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phoneNumber', 'sessionInfo', 'code'],
                properties: {
                  phoneNumber: { type: 'string', example: '+15551234567' },
                  sessionInfo: { type: 'string' },
                  code: { type: 'string', example: '123456' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Token issued',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        phoneNumber: { type: 'string' },
                        roles: {
                          type: 'array',
                          items: { type: 'string', enum: ['admin', 'vendor'] }
                        },
                        vendorId: { type: 'string', nullable: true }
                      }
                    },
                    isNewUser: { type: 'boolean' }
                  }
                }
              }
            }
          },
          '400': { description: 'Invalid code' },
          '401': { description: 'Invalid or expired session' },
          '403': { description: 'Phone not authorised' },
          '429': { description: 'Too many attempts' },
          '500': { description: 'Server error' }
        }
      }
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        security: [],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    env: { type: 'string' },
                    time: { type: 'string', format: 'date-time' }
                  }
                },
                example: {
                  "status": "ok",
                  "env": "development",
                  "time": "2025-10-18T18:54:16.520Z"
                }
              }
            }
          }
        }
      }
    },
    '/webhook': {
      get: {
        tags: ['Webhook'],
        summary: 'Webhook verification (WhatsApp Cloud API)',
        security: [],
        parameters: [
          { in: 'query', name: 'hub.mode', schema: { type: 'string' }, required: true },
          { in: 'query', name: 'hub.verify_token', schema: { type: 'string' }, required: true },
          { in: 'query', name: 'hub.challenge', schema: { type: 'string' }, required: true }
        ],
        responses: {
          '200': { description: 'Challenge string' },
          '403': { description: 'Forbidden' }
        }
      },
      post: {
        tags: ['Webhook'],
        summary: 'Receive WhatsApp webhook events',
        security: [],
        parameters: [
          {
            in: 'header',
            name: 'x-hub-signature-256',
            required: true,
            schema: { type: 'string' },
            description: 'HMAC signature for request body'
          }
        ],
        requestBody: {
          required: true,
          content: { 
            'application/json': { 
              schema: { $ref: '#/components/schemas/WhatsAppWebhookPayload' },
              example: {
                "object": "whatsapp_business_account",
                "entry": [
                  {
                    "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
                    "changes": [
                      {
                        "value": {
                          "messaging_product": "whatsapp",
                          "metadata": {
                            "display_phone_number": "15551234567",
                            "phone_number_id": "123456789012345"
                          },
                          "messages": [
                            {
                              "id": "wamid.HBgNMTU1NTEyMzQ1NjcVAgARGBI5QkI2NkY3QzI1Q0Q0NzQyRgA=",
                              "from": "15551234567",
                              "timestamp": "1672531200",
                              "type": "text",
                              "text": {
                                "body": "Hello, I need help with my order"
                              }
                            }
                          ]
                        },
                        "field": "messages"
                      }
                    ]
                  }
                ]
              }
            } 
          }
        },
        responses: { 
          '200': { 
            description: 'Webhook event accepted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'accepted' }
                  }
                }
              }
            }
          },
          '401': { description: 'Invalid signature' }
        }
      }
    },
    '/api/vendors/register': {
      post: {
        tags: ['Vendors'],
        summary: 'Register a vendor',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterVendorRequest' },
              example: {
                "businessName": "Acme Restaurant",
                "phone": "+1234567890",
                "email": "owner@acmerestaurant.com",
                "subscriptionPlan": "Starter"
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Vendor created',
            content: { 
              'application/json': { 
                schema: { $ref: '#/components/schemas/Vendor' },
                example: {
                  "id": "vendor_123456",
                  "businessName": "Acme Restaurant",
                  "phone": "+1234567890",
                  "email": "owner@acmerestaurant.com",
                  "subscriptionPlan": "Starter",
                  "subscriptionStatus": "active",
                  "walletBalanceMilli": 0,
                  "markupPercent": 50,
                  "createdAt": "2025-10-18T18:54:16.520Z",
                  "updatedAt": "2025-10-18T18:54:16.520Z"
                }
              } 
            }
          },
          '400': { description: 'Invalid request data' }
        }
      }
    },
    '/api/vendors/{id}/usage-analytics': {
      get: {
        tags: ['Vendors'],
        summary: 'Get usage analytics for a vendor',
        description: 'Total amount charged to the vendor wallet, in millirupees (1 rupee = 1000 millirupees).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Usage analytics',
            content: { 
              'application/json': { 
                schema: { $ref: '#/components/schemas/UsageAnalytics' },
                example: {
                  "vendorId": "vendor_123456",
                  "chargedMilli": 150000
                }
              } 
            }
          },
          '404': { description: 'Vendor not found' }
        }
      }
    },
    '/api/vendors/{id}/config': {
      get: {
        tags: ['Vendors'],
        summary: 'Get vendor config',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Vendor config', content: { 'application/json': { schema: { $ref: '#/components/schemas/VendorConfig' } } } },
          '404': { description: 'Not found' }
        }
      }
    },
    '/api/vendors/{id}/billing-config': {
      patch: {
        tags: ['Vendors'],
        summary: 'Update vendor billing config (admin only)',
        description: 'Sets the per-vendor markup applied on top of AI + WhatsApp + platform cost when charging the wallet.',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/BillingConfigRequest' },
              example: { "markupPercent": 50 }
            }
          }
        },
        responses: {
          '200': {
            description: 'Updated billing config',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/BillingConfigResponse' },
                example: { "id": "vendor_123456", "markupPercent": 50 }
              }
            }
          },
          '400': { description: 'Invalid markupPercent' },
          '403': { description: 'Admin role required' },
          '404': { description: 'Vendor not found' }
        }
      }
    },
    '/api/vendors/{id}/wallet-transactions': {
      get: {
        tags: ['Vendors'],
        summary: 'List recent wallet transactions (admin only)',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          { in: 'query', name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } }
        ],
        responses: {
          '200': {
            description: 'Wallet ledger, newest first',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WalletTransactionsResponse' },
                example: {
                  "transactions": [
                    {
                      "id": "txn_123456",
                      "transactionType": "deduction",
                      "amountMilli": 390,
                      "balanceAfterMilli": 99610,
                      "transactionDate": "2025-10-18T18:54:16.520Z",
                      "metadata": { "source": "conversation_turn", "markupPercent": 50 }
                    }
                  ]
                }
              }
            }
          },
          '400': { description: 'Invalid query' },
          '403': { description: 'Admin role required' }
        }
      }
    },
    '/api/vendors/{id}/dashboard-stats': {
      get: {
        tags: ['Vendors'],
        summary: 'Get comprehensive dashboard statistics',
        description: 'All wallet amounts are in millirupees (1 rupee = 1000 millirupees). Order and revenue amounts remain in paise.',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          {
            in: 'query',
            name: 'dateRange',
            required: false,
            schema: {
              type: 'string',
              enum: ['thisWeek', 'thisMonth', 'last3Months', 'last6Months', 'thisFinancialYear', 'custom'],
              default: 'thisMonth'
            }
          },
          { in: 'query', name: 'startDate', required: false, schema: { type: 'string', example: '2025-10-01' } },
          { in: 'query', name: 'endDate', required: false, schema: { type: 'string', example: '2025-10-18' } }
        ],
        responses: {
          '200': {
            description: 'Dashboard statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DashboardStats' }
              }
            }
          },
          '400': { description: 'Invalid date range' },
          '429': { description: 'Rate limited' }
        }
      }
    },
    '/api/vendors/{id}/recharge-wallet': {
      post: {
        tags: ['Vendors'],
        summary: 'Recharge vendor wallet',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { 
          required: true, 
          content: { 
            'application/json': { 
              schema: { $ref: '#/components/schemas/RechargeWalletRequest' },
              example: {
                "amount": 100
              }
            } 
          } 
        },
        responses: {
          '200': {
            description: 'New balance',
            content: { 'application/json': { schema: { type: 'object', properties: { vendorId: { type: 'string' }, walletBalanceMilli: { type: 'integer' } } } } }
          },
          '400': { description: 'Invalid amount' },
          '404': { description: 'Vendor not found' }
        }
      }
    },
    '/api/vendors/me/wallet': {
      get: {
        tags: ['Vendors'],
        summary: 'Get vendor wallet summary',
        responses: {
          '200': { description: 'Wallet summary' },
          '404': { description: 'Vendor not found' }
        }
      }
    },
    '/api/vendors/me/wallet/top-up-intent': {
      post: {
        tags: ['Vendors'],
        summary: 'Create wallet top-up intent',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amountMilli'],
                properties: { amountMilli: { type: 'integer' } }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Intent created' },
          '403': { description: 'Not approved or mock disabled' }
        }
      }
    },
    '/api/vendors/me/wallet/confirm-mock': {
      post: {
        tags: ['Vendors'],
        summary: 'Confirm mock wallet top-up',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['intentId'],
                properties: { intentId: { type: 'string', format: 'uuid' } }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Top-up completed' },
          '403': { description: 'Mock confirm unavailable' },
          '409': { description: 'Already completed' }
        }
      }
    },
    '/api/admin/settings': {
      get: {
        tags: ['Admin'],
        summary: 'Get platform billing settings',
        description:
          'Admin-only. Returns the PlatformSettings singleton. Money fields are paise. effectiveUsdToInrRate is usdToInrOverride ?? usdToInrRate.',
        responses: {
          '200': {
            description: 'Platform settings',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PlatformSettings' }
              }
            }
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' }
        }
      },
      patch: {
        tags: ['Admin'],
        summary: 'Update platform billing settings',
        description:
          'Admin-only partial update. Does not accept usdToInrRate or usdToInrFetchedAt (cron-owned). usdToInrOverride may be a number or null to clear the pin. Money fields are paise.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PlatformSettingsPatch' }
            }
          }
        },
        responses: {
          '200': {
            description: 'Updated settings',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PlatformSettings' }
              }
            }
          },
          '400': { description: 'Validation error' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' }
        }
      }
    },
    '/api/admin/settings/refresh-fx': {
      post: {
        tags: ['Admin'],
        summary: 'Refresh USD/INR from Frankfurter',
        description:
          'Admin-triggered fetch. Rejects rates outside 50..150 and leaves yesterday\'s live rate in place. Suggested EventBridge schedule for the optional Lambda: cron(30 18 * * ? *) UTC.',
        responses: {
          '200': {
            description: 'Fetch accepted and stored',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FxRefreshResult' }
              }
            }
          },
          '502': {
            description: 'Fetch rejected or upstream failed; previous settings returned',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FxRefreshResult' }
              }
            }
          },
          '401': { description: 'Authentication required' },
          '403': { description: 'Admin role required' }
        }
      }
    },
    '/api/vendors/{id}/upgrade-plan': {
      post: {
        tags: ['Vendors'],
        summary: 'Upgrade vendor plan',
        description: 'Bookkeeping only. There is no monthly credit quota; billing is prepaid wallet spend with a per-vendor markup (see PATCH /api/vendors/{id}/billing-config).',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { 
          required: true, 
          content: { 
            'application/json': { 
              schema: { $ref: '#/components/schemas/UpgradePlanRequest' },
              example: {
                "plan": "Pro"
              }
            } 
          } 
        },
        responses: {
          '200': { description: 'Updated', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, plan: { type: 'string' } } } } } },
          '400': { description: 'Invalid plan' }
        }
      }
    },
    '/api/vendors/{id}/conversations': {
      get: {
        tags: ['Vendors'],
        summary: 'List vendor conversations',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'List', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Conversation' } } } } }
        }
      }
    },
    '/api/vendors/{id}/map-wa-number': {
      post: {
        tags: ['Vendors'],
        summary: 'Map a WhatsApp phone_number_id to a vendor',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: { 
          required: true, 
          content: { 
            'application/json': { 
              schema: { $ref: '#/components/schemas/MapWaNumberRequest' },
              example: {
                "phoneNumberId": "123456789012345",
                "wabaId": "987654321098765"
              }
            } 
          } 
        },
        responses: {
          '200': { description: 'Mapping created/updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/WhatsAppNumber' } } } },
          '400': { description: 'Missing fields' }
        }
      }
    },
    '/api/conversations/{id}/messages': {
      get: {
        tags: ['Conversations'],
        summary: 'Get messages for a conversation (supports cursor-based pagination)',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
          {
            in: 'query',
            name: 'limit',
            required: false,
            schema: { type: 'integer', example: 25 },
            description: 'Maximum number of messages to return. When omitted, all messages are returned.'
          },
          {
            in: 'query',
            name: 'beforeMessageId',
            required: false,
            schema: { type: 'string' },
            description: 'When provided, returns messages older than the given message ID.'
          }
        ],
        responses: {
          '200': { 
            description: 'Messages', 
            content: { 
              'application/json': { 
                schema: { 
                  type: 'object',
                  properties: {
                    messages: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Message' }
                    },
                    hasMore: { type: 'boolean' },
                    oldestMessageId: { type: 'string', nullable: true },
                    aiPaused: { type: 'boolean' }
                  }
                },
                example: {
                  messages: [
                    {
                      "id": "msg_123456",
                      "conversationId": "conv_789012",
                      "senderType": "customer",
                      "content": "Hello, I need help with my order",
                      "type": "text",
                      "timestamp": "2025-10-18T18:54:16.520Z",
                      "aiTokensUsed": 0
                    }
                  ],
                  hasMore: false,
                  oldestMessageId: "msg_123456",
                  aiPaused: false
                }
              } 
            } 
          },
          '404': { description: 'Conversation not found' }
        }
      },
      post: {
        tags: ['Conversations'],
        summary: 'Send a message from vendor to customer',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Conversation ID' }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  content: { type: 'string', example: 'Thank you for your order!' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Message sent',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Message' }
              }
            }
          },
          '400': { description: 'Invalid request' },
          '404': { description: 'Conversation not found' }
        }
      }
    },
    '/api/conversations/{id}/ai-pause': {
      put: {
        tags: ['Conversations'],
        summary: 'Toggle AI pause status for a conversation',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' }, description: 'Conversation ID' }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['paused'],
                properties: {
                  paused: { type: 'boolean', example: true, description: 'Whether to pause AI responses' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'AI pause status updated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    aiPaused: { type: 'boolean' }
                  }
                }
              }
            }
          },
          '400': { description: 'Invalid request' },
          '404': { description: 'Conversation not found' }
        }
      }
    },
    '/api/vendors': {
      get: {
        tags: ['Vendors'],
        summary: 'List vendors',
        description: 'Returns all vendors for admin users, or own vendor for vendor users',
        responses: {
          '200': {
            description: 'List of vendors',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Vendor' }
                }
              }
            }
          },
          '403': { description: 'Forbidden' }
        }
      }
    },
    '/api/vendors/{id}/ai-config': {
      get: {
        tags: ['Vendors'],
        summary: 'Get AI configuration for a vendor',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'AI configuration',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    aiBotName: { type: 'string' },
                    aiPersonality: { type: 'string' },
                    aiSystemPrompt: { type: 'string' },
                    aiProducts: { type: 'string' },
                    aiGreeting: { type: 'string' },
                    aiClosing: { type: 'string' },
                    aiModel: { type: 'string' },
                    aiPreparationTimeMinutes: { type: 'integer' }
                  }
                }
              }
            }
          },
          '404': { description: 'Vendor not found' }
        }
      }
    },
    '/api/vendors/{id}/customer-insights': {
      get: {
        tags: ['Vendors'],
        summary: 'Get customer insights for a vendor',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Customer insights',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      customerId: { type: 'string' },
                      phone: { type: 'string' },
                      orderCount: { type: 'integer' },
                      totalSpent: { type: 'integer' },
                      lastOrderDate: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          },
          '404': { description: 'Vendor not found' }
        }
      }
    },
    '/api/vendors/{id}/ai-prompts': {
      put: {
        tags: ['Vendors'],
        summary: 'Update AI prompts for a vendor',
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  aiSystemPrompt: { type: 'string' },
                  aiProducts: { type: 'string' },
                  aiGreeting: { type: 'string' },
                  aiClosing: { type: 'string' },
                  aiPersonality: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'AI prompts updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Vendor' }
              }
            }
          },
          '400': { description: 'Invalid request' },
          '404': { description: 'Vendor not found' }
        }
      }
    },
    '/api/orders/{id}/notes': {
      put: {
        tags: ['Orders'],
        summary: 'Update customer notes on an order',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Order ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['customerNotes'],
                properties: {
                  customerNotes: { type: 'string', description: 'Customer notes to add to the order' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Order notes updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Order' }
              }
            }
          },
          '400': { description: 'Invalid request' },
          '404': { description: 'Order not found' }
        }
      }
    },
    '/api/orders/extract': {
      post: {
        tags: ['Orders'],
        summary: 'Manually extract order from conversation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['conversationId', 'vendorId'],
                properties: {
                  conversationId: { type: 'string', description: 'Conversation ID to extract order from' },
                  vendorId: { type: 'string', description: 'Vendor ID' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Order extracted and created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Order' }
              }
            }
          },
          '400': { description: 'Invalid request or order already exists' },
          '404': { description: 'Conversation not found' }
        }
      }
    },
    '/api/orders/customers/{customerId}/orders': {
      get: {
        tags: ['Orders'],
        summary: 'Get orders for a specific customer',
        parameters: [
          {
            in: 'path',
            name: 'customerId',
            required: true,
            schema: { type: 'string' },
            description: 'Customer ID'
          }
        ],
        responses: {
          '200': {
            description: 'List of orders for the customer',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Order' }
                }
              }
            }
          },
          '403': { description: 'Forbidden' }
        }
      }
    },
    '/api/orders/{orderId}/shipment': {
      post: {
        tags: ['Shipping'],
        summary: 'Create shipment for an order',
        description: 'Creates a shipment for an order. Returns 501 if not yet implemented.',
        parameters: [
          {
            in: 'path',
            name: 'orderId',
            required: true,
            schema: { type: 'string' },
            description: 'Order ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  shippingPartner: { type: 'string', enum: ['shiprocket', 'delhivery', 'self'] },
                  weight: { type: 'number' },
                  dimensions: {
                    type: 'object',
                    properties: {
                      length: { type: 'number' },
                      width: { type: 'number' },
                      height: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Shipment created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    shipmentId: { type: 'string' },
                    trackingNumber: { type: 'string' },
                    shippingPartner: { type: 'string' }
                  }
                }
              }
            }
          },
          '501': {
            description: 'Not implemented',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Not implemented' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/orders/{orderId}/shipping-rates': {
      get: {
        tags: ['Shipping'],
        summary: 'Get shipping rates for an order',
        description: 'Returns available shipping rates for an order. Returns 501 if not yet implemented.',
        parameters: [
          {
            in: 'path',
            name: 'orderId',
            required: true,
            schema: { type: 'string' },
            description: 'Order ID'
          }
        ],
        responses: {
          '200': {
            description: 'Shipping rates',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      partner: { type: 'string' },
                      service: { type: 'string' },
                      cost: { type: 'number' },
                      estimatedDays: { type: 'integer' }
                    }
                  }
                }
              }
            }
          },
          '501': {
            description: 'Not implemented',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Not implemented' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/shipments/{shipmentId}/label': {
      get: {
        tags: ['Shipping'],
        summary: 'Generate shipping label',
        description: 'Generates a shipping label for a shipment. Returns 501 if not yet implemented.',
        parameters: [
          {
            in: 'path',
            name: 'shipmentId',
            required: true,
            schema: { type: 'string' },
            description: 'Shipment ID'
          }
        ],
        responses: {
          '200': {
            description: 'Shipping label URL',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    labelUrl: { type: 'string', format: 'uri' }
                  }
                }
              }
            }
          },
          '501': {
            description: 'Not implemented',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Not implemented' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/shipments/{trackingNumber}/track': {
      get: {
        tags: ['Shipping'],
        summary: 'Track shipment',
        description: 'Gets tracking information for a shipment. Returns 501 if not yet implemented.',
        parameters: [
          {
            in: 'path',
            name: 'trackingNumber',
            required: true,
            schema: { type: 'string' },
            description: 'Tracking number'
          }
        ],
        responses: {
          '200': {
            description: 'Tracking information',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      location: { type: 'string' },
                      timestamp: { type: 'string', format: 'date-time' },
                      description: { type: 'string' }
                    }
                  }
                }
              }
            }
          },
          '501': {
            description: 'Not implemented',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Not implemented' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/usage': {
      get: {
        tags: ['Usage'],
        summary: 'Get current OpenAI usage statistics',
        description: 'Returns daily usage statistics and budget information. Admin only.',
        responses: {
          '200': {
            description: 'Usage statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        dailyUsage: {
                          type: 'object',
                          properties: {
                            cost: { type: 'number' },
                            requests: { type: 'integer' },
                            tokens: { type: 'integer' }
                          }
                        },
                        budget: {
                          type: 'object',
                          properties: {
                            limit: { type: 'number' },
                            used: { type: 'number' },
                            remaining: { type: 'number' },
                            percentage: { type: 'number' }
                          }
                        },
                        recommendations: {
                          type: 'array',
                          items: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '403': { description: 'Forbidden - Admin only' }
        }
      }
    },
    '/api/usage/reset': {
      post: {
        tags: ['Usage'],
        summary: 'Reset daily usage statistics',
        description: 'Resets daily usage statistics (for testing). Admin only.',
        responses: {
          '200': {
            description: 'Usage reset successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          },
          '403': { description: 'Forbidden - Admin only' }
        }
      }
    },
    '/api/errors/stats': {
      get: {
        tags: ['Health'],
        summary: 'Get error statistics',
        description: 'Returns error monitoring statistics. Admin only.',
        responses: {
          '200': {
            description: 'Error statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalErrors: { type: 'integer' },
                    errorsByType: { type: 'object' },
                    currentErrorRate: { type: 'number' },
                    timestamp: { type: 'string', format: 'date-time' },
                    uptime: { type: 'number' },
                    memoryUsage: { type: 'object' }
                  }
                }
              }
            }
          },
          '403': { description: 'Forbidden - Admin only' }
        }
      }
    },
    '/api/orders': {
      get: {
        tags: ['Orders'],
        summary: 'Get orders for a vendor',
        parameters: [
          {
            in: 'query',
            name: 'vendorId',
            required: true,
            schema: { type: 'string' },
            description: 'Vendor ID'
          },
          {
            in: 'query',
            name: 'status',
            required: false,
            schema: { type: 'string', enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'] },
            description: 'Filter by order status'
          }
        ],
        responses: {
          '200': {
            description: 'List of orders',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Order' }
                }
              }
            }
          }
        }
      }
    },
    '/api/orders/{id}': {
      get: {
        tags: ['Orders'],
        summary: 'Get order details',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Order ID'
          }
        ],
        responses: {
          '200': {
            description: 'Order details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Order' }
              }
            }
          },
          '404': { description: 'Order not found' }
        }
      }
    },
    '/api/orders/{id}/status': {
      put: {
        tags: ['Orders'],
        summary: 'Update order status',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Order ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'],
                    example: 'confirmed'
                  },
                  estimatedDelivery: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Estimated delivery date (optional)'
                  },
                  cancellationReason: {
                    type: 'string',
                    description: 'Cancellation reason (required if status is cancelled)'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Order updated successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Order' }
              }
            }
          },
          '400': { description: 'Invalid status or missing required fields' },
          '404': { description: 'Order not found' }
        }
      }
    },
    '/api/orders/{id}/notify': {
      post: {
        tags: ['Orders'],
        summary: 'Send WhatsApp notification for order status',
        description: 'Manually trigger a WhatsApp notification for an order. Note: Notifications are automatically sent when order status is updated.',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Order ID'
          }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'],
                    description: 'Order status to notify about (defaults to current order status)'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Notification queued successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    queued: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Notification queued successfully' }
                  }
                }
              }
            }
          },
          '404': { description: 'Order not found' },
          '500': { description: 'Failed to queue notification' }
        }
      }
    },
    '/api/orders/{id}/confirm': {
      post: {
        tags: ['Orders'],
        summary: 'Confirm an order',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Order ID'
          }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  estimatedDelivery: {
                    type: 'string',
                    format: 'date-time',
                    description: 'Estimated delivery date (optional)'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Order confirmed',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Order' }
              }
            }
          },
          '404': { description: 'Order not found' }
        }
      }
    },
    '/api/orders/{id}/cancel': {
      post: {
        tags: ['Orders'],
        summary: 'Cancel an order',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'string' },
            description: 'Order ID'
          }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reason: {
                    type: 'string',
                    description: 'Cancellation reason (optional)'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Order cancelled',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Order' }
              }
            }
          },
          '404': { description: 'Order not found' }
        }
      }
    },
    '/api/orders/vendor/{vendorId}/stats': {
      get: {
        tags: ['Orders'],
        summary: 'Get order statistics for a vendor',
        parameters: [
          {
            in: 'path',
            name: 'vendorId',
            required: true,
            schema: { type: 'string' },
            description: 'Vendor ID'
          }
        ],
        responses: {
          '200': {
            description: 'Order statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    totalOrders: { type: 'integer', example: 150 },
                    totalRevenue: { type: 'integer', example: 5000000, description: 'Revenue in paise (smallest currency unit)' },
                    statusBreakdown: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          status: { type: 'string' },
                          count: { type: 'integer' },
                          revenue: { type: 'integer' }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/orders/{orderId}/payment-link': {
      post: {
        tags: ['Payments'],
        summary: 'Generate payment link for an order',
        description: 'Creates a payment link for an order. Returns 501 if not yet implemented.',
        parameters: [
          {
            in: 'path',
            name: 'orderId',
            required: true,
            schema: { type: 'string' },
            description: 'Order ID'
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount', 'customerPhone'],
                properties: {
                  amount: {
                    type: 'integer',
                    description: 'Payment amount in paise (smallest currency unit)',
                    example: 50000
                  },
                  customerPhone: {
                    type: 'string',
                    description: 'Customer phone number',
                    example: '+919876543210'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Payment link generated',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    paymentLink: { type: 'string', example: 'https://pay.chatlogix.com/pay/order-123' },
                    paymentLinkId: { type: 'string' },
                    expiresAt: { type: 'string', format: 'date-time' }
                  }
                }
              }
            }
          },
          '501': {
            description: 'Not implemented',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Not implemented' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/payment-links/{linkId}/status': {
      get: {
        tags: ['Payments'],
        summary: 'Get payment link status',
        description: 'Check the status of a payment link. Returns 501 if not yet implemented.',
        parameters: [
          {
            in: 'path',
            name: 'linkId',
            required: true,
            schema: { type: 'string' },
            description: 'Payment link ID'
          }
        ],
        responses: {
          '200': {
            description: 'Payment link status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['pending', 'paid', 'expired', 'failed'],
                      example: 'pending'
                    },
                    paidAt: { type: 'string', format: 'date-time' },
                    amount: { type: 'integer' },
                    orderId: { type: 'string' }
                  }
                }
              }
            }
          },
          '501': {
            description: 'Not implemented',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Not implemented' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/payments/webhook': {
      post: {
        tags: ['Payments'],
        summary: 'Handle payment webhooks',
        description: 'Receives webhook events from payment gateways. Returns 501 if not yet implemented.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'Payment gateway webhook payload'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Webhook processed successfully'
          },
          '501': {
            description: 'Not implemented',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Not implemented' }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      Vendor: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          businessName: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          subscriptionPlan: { type: 'string', description: 'Bookkeeping only; does not affect billing' },
          subscriptionStatus: { type: 'string' },
          walletBalanceMilli: { type: 'integer', description: 'Wallet balance in millirupees' },
          markupPercent: { type: 'integer', description: 'Per-vendor markup applied at charge time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      VendorConfig: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          businessName: { type: 'string' },
          plan: { type: 'string', description: 'Bookkeeping only; does not affect billing' },
          status: { type: 'string' },
          walletBalanceMilli: { type: 'integer', description: 'Wallet balance in millirupees' },
          markupPercent: { type: 'integer', description: 'Per-vendor markup applied at charge time' },
          category: { type: 'string', nullable: true },
          catalogImportEnabled: { type: 'boolean' },
          ai: {
            type: 'object',
            properties: {
              botName: { type: 'string', nullable: true },
              personality: { type: 'string', nullable: true },
              systemPrompt: { type: 'string', nullable: true },
              greeting: { type: 'string', nullable: true },
              closing: { type: 'string', nullable: true },
              preparationTimeMinutes: { type: 'integer', nullable: true },
              deliveryInstructions: { type: 'string', nullable: true },
              pickupDeliveryAddress: { type: 'string', nullable: true },
              toneExample: { type: 'string', nullable: true }
            }
          }
        }
      },
      BillingConfigRequest: {
        type: 'object',
        required: ['markupPercent'],
        properties: {
          markupPercent: { type: 'integer', minimum: 0, maximum: 500 }
        }
      },
      BillingConfigResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          markupPercent: { type: 'integer' }
        }
      },
      PlatformSettings: {
        type: 'object',
        description: 'Platform billing knobs. Money fields are paise (1 rupee = 100 paise).',
        properties: {
          usdToInrRate: { type: 'number', example: 83.4521 },
          usdToInrSource: { type: 'string', example: 'frankfurter' },
          usdToInrFetchedAt: { type: 'string', format: 'date-time', nullable: true },
          usdToInrOverride: { type: 'number', nullable: true, example: null },
          effectiveUsdToInrRate: { type: 'number', example: 83.4521 },
          platformFeePerTurnPaise: { type: 'integer', example: 0 },
          platformFeeOutboundMediaPaise: { type: 'integer', example: 0 },
          trialGrantPaise: { type: 'integer', example: 5000 },
          trialExpiryDays: { type: 'integer', example: 30 },
          catalogImportDailyPaiseCap: { type: 'integer', example: 5000 },
          catalogEnhanceDailyPaiseCap: { type: 'integer', example: 3000 },
          minWalletTopUpPaise: { type: 'integer', example: 10000 },
          maxWalletTopUpPaise: { type: 'integer', example: 5000000 },
          walletTopUpPresetsPaise: {
            type: 'array',
            items: { type: 'integer' },
            example: [50000, 100000, 200000, 500000]
          },
          mockWalletTopUpEnabled: { type: 'boolean', example: true },
          updatedAt: { type: 'string', format: 'date-time' },
          updatedBy: { type: 'string', nullable: true }
        }
      },
      PlatformSettingsPatch: {
        type: 'object',
        additionalProperties: false,
        properties: {
          usdToInrOverride: { type: 'number', nullable: true, minimum: 50, maximum: 150 },
          platformFeePerTurnPaise: { type: 'integer', minimum: 0 },
          platformFeeOutboundMediaPaise: { type: 'integer', minimum: 0 },
          trialGrantPaise: { type: 'integer', minimum: 0 },
          trialExpiryDays: { type: 'integer', minimum: 1, maximum: 3650 },
          catalogImportDailyPaiseCap: { type: 'integer', minimum: 0 },
          catalogEnhanceDailyPaiseCap: { type: 'integer', minimum: 0 },
          minWalletTopUpPaise: { type: 'integer', minimum: 0 },
          maxWalletTopUpPaise: { type: 'integer', minimum: 0 },
          walletTopUpPresetsPaise: { type: 'array', items: { type: 'integer', minimum: 0 } },
          mockWalletTopUpEnabled: { type: 'boolean' }
        }
      },
      FxRefreshResult: {
        type: 'object',
        required: ['ok', 'settings'],
        properties: {
          ok: { type: 'boolean' },
          rate: { type: 'number' },
          reason: { type: 'string', enum: ['fetch_failed', 'invalid_payload', 'out_of_range'] },
          settings: { $ref: '#/components/schemas/PlatformSettings' }
        }
      },
      WalletTransaction: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          transactionType: { type: 'string', enum: ['recharge', 'deduction', 'refund'] },
          amountMilli: { type: 'integer' },
          balanceAfterMilli: { type: 'integer' },
          transactionDate: { type: 'string', format: 'date-time' },
          metadata: { type: 'object', additionalProperties: true }
        }
      },
      WalletTransactionsResponse: {
        type: 'object',
        properties: {
          transactions: { type: 'array', items: { $ref: '#/components/schemas/WalletTransaction' } }
        }
      },
      DashboardBilling: {
        type: 'object',
        description: 'Prepaid wallet spend. All amounts are millirupees (1 rupee = 1000 millirupees).',
        properties: {
          balanceMilli: { type: 'integer' },
          spend: {
            type: 'object',
            properties: {
              today: { type: 'integer' },
              thisWeek: { type: 'integer' },
              thisMonth: { type: 'integer' },
              total: { type: 'integer' }
            }
          },
          breakdownBySource: {
            type: 'array',
            description:
              'Spend grouped by the action that produced the charge (conversation_turn, legacy_conversation_turn, outbound_media, catalog_import, catalog_enhance, catalog_enhance_transcribe, sandbox_chat, sandbox_transcribe) over the requested date range; only sources with recorded spend appear.',
            items: {
              type: 'object',
              properties: {
                source: { type: 'string', example: 'conversation_turn' },
                label: { type: 'string', example: 'Customer replies' },
                milli: { type: 'integer' },
                count: { type: 'integer' }
              }
            }
          },
          dailySpend: {
            type: 'array',
            description: 'Trailing 7 calendar days including today, backfilled with zeros.',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', example: '2025-10-18' },
                milli: { type: 'integer' }
              }
            }
          },
          averagePerDayMilli: { type: 'integer' },
          projectedMonthlySpendMilli: { type: 'integer' },
          lowBalanceWarning: { type: 'boolean', description: 'True when the balance is below ₹20 (20000 millirupees)' },
          billingCycleStart: { type: 'string', format: 'date-time' },
          billingCycleEnd: { type: 'string', format: 'date-time' }
        }
      },
      DashboardStats: {
        type: 'object',
        properties: {
          dateRange: {
            type: 'object',
            properties: {
              preset: { type: 'string' },
              startDate: { type: 'string', example: '2025-10-01' },
              endDate: { type: 'string', example: '2025-10-18' },
              label: { type: 'string' }
            }
          },
          orders: { type: 'object', additionalProperties: true },
          revenue: { type: 'object', additionalProperties: true, description: 'Order money, in paise' },
          billing: { $ref: '#/components/schemas/DashboardBilling' },
          products: { type: 'object', additionalProperties: true },
          conversations: { type: 'object', additionalProperties: true },
          recentOrders: { type: 'array', items: { type: 'object', additionalProperties: true } }
        }
      },
      RegisterVendorRequest: {
        type: 'object',
        required: ['businessName', 'phone', 'email'],
        properties: {
          businessName: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          subscriptionPlan: { type: 'string' }
        }
      },
      RechargeWalletRequest: {
        type: 'object',
        required: ['amount'],
        properties: { amount: { type: 'number', minimum: 1 } }
      },
      UpgradePlanRequest: {
        type: 'object',
        required: ['plan'],
        properties: { plan: { type: 'string', enum: ['Starter', 'Pro', 'Business', 'Enterprise'] } }
      },
      Conversation: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          vendorId: { type: 'string' },
          customerId: { type: 'string' },
          status: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      Message: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          conversationId: { type: 'string' },
          senderType: { type: 'string' },
          content: { type: 'string' },
          type: { type: 'string', enum: ['text', 'audio', 'image', 'document'] },
          timestamp: { type: 'string', format: 'date-time' },
          aiTokensUsed: { type: 'integer' }
        }
      },
      UsageAnalytics: {
        type: 'object',
        properties: {
          vendorId: { type: 'string' },
          chargedMilli: { type: 'integer', description: 'Total wallet spend in millirupees' }
        }
      },
      MapWaNumberRequest: {
        type: 'object',
        required: ['phoneNumberId', 'wabaId'],
        properties: { phoneNumberId: { type: 'string' }, wabaId: { type: 'string' } }
      },
      WhatsAppNumber: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          vendorId: { type: 'string' },
          phoneNumberId: { type: 'string' },
          wabaId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      WhatsAppWebhookPayload: {
        type: 'object',
        properties: {
          object: { type: 'string', example: 'whatsapp_business_account' },
          entry: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', example: 'WHATSAPP_BUSINESS_ACCOUNT_ID' },
                changes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      value: {
                        type: 'object',
                        properties: {
                          messaging_product: { type: 'string', example: 'whatsapp' },
                          metadata: {
                            type: 'object',
                            properties: {
                              display_phone_number: { type: 'string', example: '15551234567' },
                              phone_number_id: { type: 'string', example: '123456789012345' }
                            }
                          },
                          messages: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                id: { type: 'string' },
                                from: { type: 'string' },
                                timestamp: { type: 'string' },
                                type: { type: 'string', enum: ['text', 'audio', 'image', 'document'] },
                                text: {
                                  type: 'object',
                                  properties: {
                                    body: { type: 'string' }
                                  }
                                },
                                audio: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string' },
                                    mime_type: { type: 'string' }
                                  }
                                },
                                image: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string' },
                                    mime_type: { type: 'string' },
                                    caption: { type: 'string' }
                                  }
                                },
                                document: {
                                  type: 'object',
                                  properties: {
                                    id: { type: 'string' },
                                    mime_type: { type: 'string' },
                                    filename: { type: 'string' }
                                  }
                                }
                              }
                            }
                          }
                        }
                      },
                      field: { type: 'string', example: 'messages' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          orderNumber: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled']
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                product: { type: 'string' },
                quantity: { type: 'integer' },
                unitPrice: { type: 'integer' },
                totalPrice: { type: 'integer' }
              }
            }
          },
          totalAmount: { type: 'integer', description: 'Amount in paise (smallest currency unit)' },
          deliveryAddress: { type: 'string' },
          estimatedDelivery: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
};


