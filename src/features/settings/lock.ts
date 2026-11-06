const ITERATIONS = 600_000;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function hashPin(pin: string, saltBase64: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(saltBase64), iterations: ITERATIONS },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

export function newSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function faceIdAvailable(): Promise<boolean> {
  try {
    return (
      (await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()) ?? false
    );
  } catch {
    return false;
  }
}

/**
 * A device passkey is used only to make the phone ask for Face ID. There is no server, so nothing
 * verifies the signature: like the PIN, this is a screen lock and not encryption.
 */
export async function registerFaceId(): Promise<string> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Meu Bem', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'Meu Bem',
        displayName: 'Meu Bem',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('Não foi possível ativar.');
  return toBase64(new Uint8Array(credential.rawId));
}

export async function verifyFaceId(credentialId: string): Promise<boolean> {
  try {
    const result = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: fromBase64(credentialId) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return result !== null;
  } catch {
    return false;
  }
}
