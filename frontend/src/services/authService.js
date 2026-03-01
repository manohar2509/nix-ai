import {
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  confirmSignIn,
  resendSignUpCode,
  resetPassword,
  confirmResetPassword,
  getCurrentUser,
  fetchAuthSession,
  fetchUserAttributes,
} from 'aws-amplify/auth';

/**
 * Auth Service — AWS Cognito (Amplify v6)
 *
 * Handles:
 * - Sign In / Sign Up / Sign Out via Cognito
 * - Email verification (confirmation code)
 * - Forgot / Reset password
 * - JWT token retrieval for API calls
 * - User attribute mapping (including custom:organization, custom:job_title)
 * - Cognito group → role mapping
 *
 * All token management & session refresh is handled by Amplify automatically.
 */

export const authService = {
  // ════════════════════════════════════════════
  // SIGN IN
  // ════════════════════════════════════════════

  /**
   * Sign in with email + password via Cognito
   * @returns {{ user: object, isSignedIn: boolean } | { isSignedIn: false, nextStep }}
   */
  login: async (email, password) => {
    try {
      const result = await signIn({
        username: email,
        password,
      });

      if (result.isSignedIn) {
        const userData = await authService.buildUserObject();
        return { user: userData, isSignedIn: true };
      }

      // Handle additional challenges (MFA, NEW_PASSWORD_REQUIRED, etc.)
      return {
        isSignedIn: false,
        nextStep: result.nextStep,
      };
    } catch (error) {
      throw {
        message: authService.getErrorMessage(error),
        code: error.name,
        details: error.message,
      };
    }
  },

  // ════════════════════════════════════════════
  // COMPLETE NEW PASSWORD (Admin-created users)
  // ════════════════════════════════════════════

  /**
   * Complete the NEW_PASSWORD_REQUIRED challenge.
   * Called when an admin creates a user in Cognito Console with a
   * temporary password — the user must set a permanent one on first login.
   *
   * @param {string} newPassword  — the permanent password chosen by the user
   * @param {object} [userAttributes] — any missing required attributes (e.g. name)
   */
  completeNewPassword: async (newPassword, userAttributes = {}) => {
    try {
      const result = await confirmSignIn({
        challengeResponse: newPassword,
        options: userAttributes && Object.keys(userAttributes).length > 0
          ? { userAttributes }
          : undefined,
      });

      if (result.isSignedIn) {
        const userData = await authService.buildUserObject();
        return { user: userData, isSignedIn: true };
      }

      // There might be another challenge (e.g. MFA)
      return {
        isSignedIn: false,
        nextStep: result.nextStep,
      };
    } catch (error) {
      console.error('[Auth] completeNewPassword failed:', error.name, error.message);
      throw {
        message: authService.getErrorMessage(error),
        code: error.name,
        details: error.message,
      };
    }
  },

  // ════════════════════════════════════════════
  // SIGN UP
  // ════════════════════════════════════════════

  /**
   * Register a new user with custom Cognito attributes
   * Triggers email verification via Cognito
   */
  signUp: async ({ email, password, name, organization, jobTitle }) => {
    // Build user attributes — start with standard attrs, add custom ones
    const baseAttributes = { email, name };
    const customAttributes = {};
    if (organization) customAttributes['custom:organization'] = organization;
    if (jobTitle) customAttributes['custom:job_title'] = jobTitle;

    try {
      // Attempt sign-up with all attributes (standard + custom)
      const result = await signUp({
        username: email,
        password,
        options: {
          userAttributes: { ...baseAttributes, ...customAttributes },
        },
      });

      return {
        isSignUpComplete: result.isSignUpComplete,
        nextStep: result.nextStep,
        userId: result.userId,
      };
    } catch (error) {
      console.error('[Auth] SignUp failed:', error.name, error.message);

      // If custom attributes caused the error, retry without them
      if (
        error.name === 'InvalidParameterException' &&
        Object.keys(customAttributes).length > 0
      ) {
        console.warn('[Auth] Retrying sign-up without custom attributes');
        try {
          const result = await signUp({
            username: email,
            password,
            options: {
              userAttributes: baseAttributes,
            },
          });

          return {
            isSignUpComplete: result.isSignUpComplete,
            nextStep: result.nextStep,
            userId: result.userId,
          };
        } catch (retryError) {
          console.error('[Auth] SignUp retry failed:', retryError.name, retryError.message);
          throw {
            message: authService.getErrorMessage(retryError),
            code: retryError.name,
            details: retryError.message,
          };
        }
      }

      throw {
        message: authService.getErrorMessage(error),
        code: error.name,
        details: error.message,
      };
    }
  },

  /**
   * Confirm sign-up with the 6-digit verification code sent to email
   */
  confirmSignUp: async (email, code) => {
    try {
      const result = await confirmSignUp({
        username: email,
        confirmationCode: code,
      });
      return { isSignUpComplete: result.isSignUpComplete };
    } catch (error) {
      throw {
        message: authService.getErrorMessage(error),
        code: error.name,
        details: error.message,
      };
    }
  },

  /**
   * Resend the verification code to the user's email
   */
  resendVerificationCode: async (email) => {
    try {
      await resendSignUpCode({ username: email });
      return { success: true };
    } catch (error) {
      throw {
        message: authService.getErrorMessage(error),
        code: error.name,
        details: error.message,
      };
    }
  },

  // ════════════════════════════════════════════
  // FORGOT / RESET PASSWORD
  // ════════════════════════════════════════════

  /**
   * Initiate forgot-password flow (sends reset code to email)
   */
  forgotPassword: async (email) => {
    try {
      const result = await resetPassword({ username: email });
      return { nextStep: result.nextStep };
    } catch (error) {
      throw {
        message: authService.getErrorMessage(error),
        code: error.name,
        details: error.message,
      };
    }
  },

  /**
   * Confirm password reset with code + new password
   */
  confirmForgotPassword: async (email, code, newPassword) => {
    try {
      await confirmResetPassword({
        username: email,
        confirmationCode: code,
        newPassword,
      });
      return { success: true };
    } catch (error) {
      throw {
        message: authService.getErrorMessage(error),
        code: error.name,
        details: error.message,
      };
    }
  },

  // ════════════════════════════════════════════
  // SIGN OUT
  // ════════════════════════════════════════════

  /**
   * Sign out — clears all Cognito tokens and local session
   */
  logout: async () => {
    try {
      await signOut();
      return { success: true };
    } catch (error) {
      console.error('Logout failed:', error);
      // Force clear even on error
      return { success: false };
    }
  },

  // ════════════════════════════════════════════
  // SESSION & TOKEN HELPERS
  // ════════════════════════════════════════════

  /**
   * Get the currently signed-in Cognito user (or null)
   */
  getCurrentUser: async () => {
    try {
      const cognitoUser = await getCurrentUser();
      return cognitoUser;
    } catch {
      return null;
    }
  },

  /**
   * Get the current auth session (contains tokens)
   */
  getSession: async () => {
    try {
      const session = await fetchAuthSession();
      return session;
    } catch {
      return null;
    }
  },

  /**
   * Get the ID Token JWT for API Authorization header.
   * Amplify auto-refreshes expired tokens.
   */
  getIdToken: async () => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() || null;
    } catch {
      return null;
    }
  },

  /**
   * Get the Access Token JWT
   */
  getAccessToken: async () => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() || null;
    } catch {
      return null;
    }
  },

  /**
   * Get all user attributes from Cognito
   */
  getUserAttributes: async () => {
    try {
      const attributes = await fetchUserAttributes();
      return attributes;
    } catch {
      return null;
    }
  },

  // ════════════════════════════════════════════
  // USER OBJECT BUILDER
  // ════════════════════════════════════════════

  /**
   * Build a normalised user object from Cognito data.
   * Merges: cognitoUser + userAttributes + token groups
   *
   * Shape:
   * {
   *   id, username, email, name, organization, jobTitle,
   *   role ('ADMIN' | 'CLINICAL'), groups, avatar (initials)
   * }
   */
  buildUserObject: async () => {
    try {
      const [cognitoUser, attributes, session] = await Promise.all([
        getCurrentUser(),
        fetchUserAttributes(),
        fetchAuthSession(),
      ]);

      // Extract Cognito groups from the ID token payload
      const groups =
        session.tokens?.idToken?.payload?.['cognito:groups'] || [];
      const isAdmin =
        groups.includes('Admin') || groups.includes('admin');

      const name =
        attributes.name ||
        attributes.email?.split('@')[0] ||
        'User';

      const initials = name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();

      return {
        id: cognitoUser.userId,
        username: cognitoUser.username,
        email: attributes.email,
        name,
        organization: attributes['custom:organization'] || '',
        jobTitle: attributes['custom:job_title'] || '',
        role: isAdmin ? 'ADMIN' : 'CLINICAL',
        groups,
        avatar: initials,
      };
    } catch (error) {
      console.error('Failed to build user object:', error);
      return null;
    }
  },

  // ════════════════════════════════════════════
  // VALIDATION HELPERS
  // ════════════════════════════════════════════

  /**
   * Check if a user is currently authenticated
   */
  isAuthenticated: async () => {
    try {
      await getCurrentUser();
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Validate current session (are tokens still valid?)
   */
  validateSession: async () => {
    try {
      const session = await fetchAuthSession();
      return !!session.tokens;
    } catch {
      return false;
    }
  },

  // ════════════════════════════════════════════
  // ERROR MESSAGE MAPPING
  // ════════════════════════════════════════════

  /**
   * Map Cognito error names to user-friendly messages
   */
  getErrorMessage: (error) => {
    const errorMap = {
      UserNotFoundException: 'No account found with this email address.',
      NotAuthorizedException: 'Incorrect email or password.',
      UserNotConfirmedException:
        'Please verify your email address first.',
      UsernameExistsException:
        'An account with this email already exists.',
      CodeMismatchException:
        'Invalid verification code. Please try again.',
      ExpiredCodeException:
        'Verification code has expired. Please request a new one.',
      InvalidPasswordException:
        'Password must be at least 8 characters with uppercase, lowercase, number, and symbol.',
      LimitExceededException:
        'Too many attempts. Please wait a moment and try again.',
      InvalidParameterException:
        'Invalid sign-up parameters. Please check all fields and try again.',
      CodeDeliveryFailureException:
        'Unable to send verification code. Please try again later.',
      TooManyRequestsException:
        'Too many requests. Please slow down and try again.',
      UserAlreadyAuthenticatedException:
        'You are already signed in.',
    };
    return (
      errorMap[error.name] ||
      error.message ||
      'An unexpected error occurred.'
    );
  },
};

export default authService;
