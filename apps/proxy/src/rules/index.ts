// Detection rules barrel — re-exports all rule sets for convenient import
// from a single location: `import { ... } from '../rules/index.js'`

export * from './request-injection.rules.js';
export * from './response-threats.rules.js';
export * from './tool-poisoning.rules.js';
export * from './auth-gaps.rules.js';
export * from './over-permissions.rules.js';
export * from './llm-pii-patterns.rules.js';
// llm-credential-patterns are already exported by response-threats.rules as CREDENTIAL_PATTERNS.
// Import directly from response-threats.rules.js if you need the credential patterns alone.
