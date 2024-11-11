module.exports = {
    testEnvironment: 'node',
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'services/**/*.js',
        '!services/**/*.spec.js'
    ],
    testMatch: [
        '**/tests/**/*.spec.js',
        '**/tests/**/*.test.js'
    ],
    moduleFileExtensions: ['js', 'json'],
    setupFilesAfterEnv: ['./tests/setup.js'],
    testTimeout: 30000,
    verbose: true,
    forceExit: true,
    detectOpenHandles: true,
};
