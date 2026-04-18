export interface SecretPayload {
  [key: string]: string;
}

export interface SecretStore {
  delete(secretRef: string): void;
  get(secretRef: string): SecretPayload | null;
  put(secretRef: string, payload: SecretPayload): void;
}
