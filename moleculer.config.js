"use strict";

module.exports = {
  namespace: process.env.MOLECULER_NAMESPACE,
  nodeID: null,

  logger: true,
  logLevel: "info",

  transporter: process.env.NATS_URL,

  serializer: "JSON",

  requestTimeout: 10 * 1000,

  retryPolicy: {
    enabled: true,
    retries: 5,
    delay: 100,
    maxDelay: 1000,
    factor: 2,
    check: err => err && !!err.retryable
  },

  maxCallLevel: 100,
  heartbeatInterval: 5,
  heartbeatTimeout: 15,

  tracking: {
    enabled: true,
    shutdownTimeout: 5000,
  },

  disableBalancer: false,

  registry: {
    strategy: "RoundRobin",
    preferLocal: true
  },

  circuitBreaker: {
    enabled: true,
    threshold: 0.5,
    windowTime: 60,
    minRequestCount: 20,
    halfOpenTime: 10000,
    check: err => err && err.code >= 500
  },

  bulkhead: {
    enabled: true,
    concurrency: 10,
    maxQueueSize: 100,
  },

  validation: true,
  validator: null,

  metrics: {
    enabled: true,
    reporter: {
      type: "Event"
    }
  },

  tracing: {
    enabled: true,
    exporter: {
      type: "Event"
    }
  },

  middlewares: [],

  replDelimiter: "::"
};
