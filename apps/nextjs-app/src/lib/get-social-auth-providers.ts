type SocialAuthEnv = Record<string, string | undefined>;

const isOidcConfigured = (env: SocialAuthEnv) =>
  Boolean(
    env.BACKEND_OIDC_CLIENT_ID &&
      env.BACKEND_OIDC_CLIENT_SECRET &&
      env.BACKEND_OIDC_CALLBACK_URL &&
      (env.BACKEND_OIDC_ISSUER ||
        (env.BACKEND_OIDC_AUTHORIZATION_URL &&
          env.BACKEND_OIDC_TOKEN_URL &&
          env.BACKEND_OIDC_USER_INFO_URL))
  );

export const getSocialAuthProviders = (env: SocialAuthEnv = process.env) => {
  const providers = new Set(
    env.SOCIAL_AUTH_PROVIDERS?.split(',')
      .map((provider) => provider.trim())
      .filter(Boolean) ?? []
  );

  if (isOidcConfigured(env)) {
    providers.add('oidc');
  }

  return Array.from(providers);
};
