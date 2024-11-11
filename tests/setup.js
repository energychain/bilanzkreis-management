process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://localhost:27017/bilanzkreis_test';
process.env.NATS_URL = 'nats://localhost:4222';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRATION = '1h';
process.env.API_PORT = '3000';

// Globale Test-Timeouts erhöhen
jest.setTimeout(30000);
