import { decryptSecret, encryptSecret } from "@/lib/security/vault";

export interface StoredProviderCredential {
  id: string;
  organizationId: string;
  provider: string;
  credentialKeyVersion: number;
  encryptedCredential: string;
}

export function providerCredentialAad(
  organizationId: string,
  provider: string,
  credentialId: string,
  version: number,
): string {
  return `token-intelligence:${organizationId}:${provider}:${credentialId}:v${version}`;
}

function legacyAad(organizationId: string, provider: string, credentialId: string): string {
  return `${organizationId}:${provider}:${credentialId}`;
}

export function encryptProviderCredential(
  plaintext: string,
  organizationId: string,
  provider: string,
  credentialId: string,
  version: number,
): string {
  return encryptSecret(plaintext, providerCredentialAad(organizationId, provider, credentialId, version));
}

export function decryptProviderCredential(connection: StoredProviderCredential): string {
  const currentAad = providerCredentialAad(
    connection.organizationId,
    connection.provider,
    connection.id,
    connection.credentialKeyVersion,
  );

  try {
    return decryptSecret(connection.encryptedCredential, currentAad);
  } catch (error) {
    // Production Wave 2 used organization:provider:id as AAD for version 1.
    // Keep a one-way compatibility path so existing v1 records can be verified
    // and rotated into the version-bound format without downtime.
    if (connection.credentialKeyVersion === 1) {
      try {
        return decryptSecret(
          connection.encryptedCredential,
          legacyAad(connection.organizationId, connection.provider, connection.id),
        );
      } catch {
        // Preserve the original authentication failure below.
      }
    }
    throw error;
  }
}
