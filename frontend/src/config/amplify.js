/**
 * AWS Amplify Configuration
 * 
 * Connects to Amazon Cognito User Pool for authentication.
 * 
 * Environment variables (optional overrides):
 *   VITE_COGNITO_USER_POOL_ID   — Cognito User Pool ID
 *   VITE_COGNITO_CLIENT_ID      — Cognito App Client ID (no secret)
 *   VITE_COGNITO_REGION         — AWS region (defaults to us-east-1)
 */

const region = import.meta.env.VITE_COGNITO_REGION || 'us-east-1';

export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
      loginWith: {
        email: true,
      },
      // Password policy (must match Cognito User Pool settings)
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: true,
      },
      // User attributes that are used for sign-up
      userAttributes: {
        email: { required: true },
        name: { required: true },
        'custom:organization': { required: false },
        'custom:job_title': { required: false },
      },
    },
  },
};

export default amplifyConfig;
